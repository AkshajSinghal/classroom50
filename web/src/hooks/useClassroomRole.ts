import { useQuery } from "@tanstack/react-query"
import { useGitHubClient } from "@/context/github/GitHubProvider"
import { orgMembershipQuery } from "./github/queries"
import { GitHubAPIError, retryTransientGitHubError } from "./github/errors"
import { staffTeamName } from "./github/mutations"
import { classroomTeamSlugHeuristic } from "@/util/orgMembership"
import { useRoleView } from "@/context/roleView/RoleViewProvider"
import type { GitHubClient } from "./github/client"
import type { StaffRole } from "@/types/classroom"

// The viewer's effective role for the org/classroom, used by route guards and
// UI visibility. Precedence (highest first):
//   owner (org admin) > instructor > ta > student
// `unresolved` is a fail-closed sentinel: a needed signal hit a transient error,
// so callers treat it as "don't redirect; let the page load" rather than
// demoting a real staff member on a blip.
export type EffectiveRole =
  "owner" | "instructor" | "ta" | "student" | "blocked" | "unresolved"

// A tri-state membership signal: definitively in / definitively out / couldn't
// tell (transient). Mirrors the fail-closed posture of resolveTeacherVerdict.
export type Membership = "member" | "non-member" | "unresolved"

// Structural inputs so the verdict is a pure, unit-testable function (no React
// Query). Each signal is pre-reduced to its tri-state. Classroom role is decided
// by TEAM MEMBERSHIP alone — org-wide config-repo access no longer decides it.
export type ClassroomRoleInput = {
  org: string | undefined
  classroom: string | undefined
  // org admin? (true => owner). undefined when not yet known.
  isOwner: boolean | undefined
  // Per-classroom team memberships (the single source of truth for access).
  instructor: Membership
  ta: Membership
  student: Membership
}

// Pure role resolution from GitHub team membership. Owner (org admin)
// short-circuits. Otherwise a positive staff-team match wins; before trusting a
// student match or declaring `blocked`, the higher-priority staff signals must
// be settled (a student-team member who might also be staff must not render as a
// plain student while instructor/ta are still in flight). A non-owner on none of
// the classroom's teams is `blocked` — team membership, not config-repo access,
// grants classroom access. Anything still in flight yields `unresolved`.
export function resolveClassroomRole(input: ClassroomRoleInput): EffectiveRole {
  const { org, classroom, isOwner, instructor, ta, student } = input

  if (!org) return "student"

  // Owner (org admin) outranks all and isn't classroom-scoped: resolve before
  // the classroom check so an owner on an org-level route isn't misclassified.
  if (isOwner === true) return "owner"

  // Non-owner roles need a classroom. On an org-level route, hold `unresolved`
  // while ownership resolves so we don't flash a wrong verdict.
  if (!classroom) return isOwner === undefined ? "unresolved" : "student"

  // A confirmed staff-team membership is definitive and outranks the (slower)
  // owner read, so resolve a confirmed instructor/ta immediately.
  if (instructor === "member") return "instructor"
  if (ta === "member") return "ta"

  // Before trusting a student match or declaring blocked, the higher-priority
  // signals must be settled — a student-team member who might also be staff must
  // not resolve to `student` (or `blocked`) while instructor/ta are in flight.
  if (instructor === "unresolved" || ta === "unresolved") return "unresolved"

  // Ownership not yet known: don't decide a non-owner role yet. An owner needs
  // no team signal, so hold `unresolved` rather than mis-blocking a pending owner.
  if (isOwner === undefined) return "unresolved"

  // Staff teams are definitively non-member. Decide from the student team.
  if (student === "member") return "student"
  if (student === "unresolved") return "unresolved"

  // On none of the classroom's teams (and not owner): no access to this
  // classroom. Config-repo access does not grant classroom access.
  return "blocked"
}

// Whether a role may see/do instructor-or-TA classroom content. `unresolved` is
// permissive on purpose: the guard treats it as "let the page load". `blocked`
// is never staff (fail-closed: no team in this classroom => no access).
export function isStaffRole(role: EffectiveRole): boolean {
  return (
    role === "owner" ||
    role === "instructor" ||
    role === "ta" ||
    role === "unresolved"
  )
}

// Whether a role may see/do instructor-only surfaces (org + classroom settings).
// TAs are excluded; `unresolved` is permissive (see isStaffRole).
export function isInstructorRole(role: EffectiveRole): boolean {
  return role === "owner" || role === "instructor" || role === "unresolved"
}

// Whether the role is a RESOLVED owner or instructor. Unlike isInstructorRole,
// `unresolved` is NOT permissive here: use this to gate owner-only reads so they
// never fire during the role-resolution window (a non-owner would 403). The
// exclusion of `unresolved` is the whole point — see the SubmissionsPage /
// AssignmentsPage owner-only-read gates.
export function isResolvedInstructorOrOwner(role: EffectiveRole): boolean {
  return role === "owner" || role === "instructor"
}

// The roles an instructor/owner can preview the app AS. A client-side lens for
// verifying what each role sees — never escalates.
export type ViewAsRole = "ta" | "student"

// Rank for the downgrade-only clamp. `unresolved` and `blocked` are
// intentionally absent — we never clamp an in-flight role (still showing a
// spinner) nor a blocked one (the classroom is hidden; there's nothing to
// preview).
const ROLE_RANK: Record<
  Exclude<EffectiveRole, "unresolved" | "blocked">,
  number
> = {
  owner: 3,
  instructor: 2,
  ta: 1,
  student: 0,
}

// Apply a "view as" preview to an actual role. DOWNGRADE-ONLY: the preview can
// only lower the effective role, never raise it, so it can't be abused to gain
// access. `unresolved`/`blocked`/no-preview pass through unchanged (a blocked
// viewer has no classroom to preview).
export function applyViewAs(
  actual: EffectiveRole,
  viewAs: ViewAsRole | null,
): EffectiveRole {
  if (!viewAs || actual === "unresolved" || actual === "blocked") return actual
  // Applies only when it ranks strictly below the actual role; else a no-op.
  return ROLE_RANK[viewAs] < ROLE_RANK[actual] ? viewAs : actual
}

// Translation key for the human role label: owner + instructor =>
// "nav.roleInstructor", ta => "nav.roleTa", student => "nav.roleStudent",
// unresolved/blocked => null (mid-load skeleton, or no classroom access). t().
export function roleLabelKey(role: EffectiveRole): string | null {
  switch (role) {
    case "owner":
    case "instructor":
      return "nav.roleInstructor"
    case "ta":
      return "nav.roleTa"
    case "student":
      return "nav.roleStudent"
    case "unresolved":
    case "blocked":
      return null
  }
}

// Reduce a team-membership query (404 => non-member, other error => unresolved)
// to the tri-state, so a blip never demotes a real staff member.
function membershipFromQuery(isSuccess: boolean, error: unknown): Membership {
  if (isSuccess) return "member"
  if (error instanceof GitHubAPIError && error.status === 404) {
    return "non-member"
  }
  // Any other error (or no answer yet) is transient — don't demote.
  return "unresolved"
}

// Team-membership query: 2xx + active => member, 404 => definitive non-member,
// anything else throws so React Query can retry and the verdict stays
// `unresolved`.
export function teamMembershipQuery(
  client: GitHubClient,
  org: string,
  teamSlug: string,
  username: string,
) {
  return {
    queryKey: ["team-membership", org, teamSlug, username] as const,
    queryFn: async () => {
      const path = `/orgs/${encodeURIComponent(org)}/teams/${encodeURIComponent(
        teamSlug,
      )}/memberships/${encodeURIComponent(username)}`
      const membership = await client.request<{ state?: string }>(path)
      if (membership.state !== "active") {
        throw new GitHubAPIError({
          status: 404,
          url: path,
          message: "membership not active",
          body: null,
          rateLimit: {
            limit: null,
            remaining: null,
            used: null,
            reset: null,
            resource: null,
            retryAfter: null,
          },
        })
      }
      return true as const
    },
    enabled: Boolean(org && teamSlug && username),
    staleTime: 5 * 60 * 1000,
    // Definitive 404 (not a member) must not retry; transient errors self-heal.
    retry: (failureCount: number, error: unknown) => {
      if (error instanceof GitHubAPIError && error.status === 404) return false
      return failureCount < 2
    },
  }
}

// Resolve the viewer's effective role for an org/classroom from live queries:
// org membership (owner), the classroom50 repo read (staff gate), and
// instructor/ta team membership. Applies "view as" as a downgrade-only lens:
// `role` reflects the preview, `actualRole` is the real one.
export function useClassroomRole(
  org: string | undefined,
  classroom: string | undefined,
  username: string | undefined,
): { role: EffectiveRole; actualRole: EffectiveRole; isLoading: boolean } {
  const client = useGitHubClient()
  const { viewAs } = useRoleView()

  const ownerQuery = useQuery({
    ...orgMembershipQuery(client, org ?? ""),
    enabled: Boolean(org),
    // orgMembershipQuery defaults to retry:false, but a transient blip must
    // self-heal rather than pin isOwner at `undefined` (silently demoting a real
    // owner). A 404/403 is definitive.
    retry: retryTransientGitHubError,
  })

  const teamRole = (role: StaffRole) =>
    org && classroom ? staffTeamName(classroom, role) : ""
  // Student team slug: the heuristic the student themselves can derive (the
  // authoritative slug lives in the private classroom.json they can't read).
  // Classroom creation rejects names that GitHub would re-slugify, so the
  // heuristic is authoritative; a miss safe-degrades to a 404 => non-member.
  const studentSlug =
    org && classroom ? classroomTeamSlugHeuristic(classroom) : ""

  const instructorQuery = useQuery({
    ...teamMembershipQuery(
      client,
      org ?? "",
      teamRole("instructor"),
      username ?? "",
    ),
    enabled: Boolean(org && classroom && username),
  })
  const taQuery = useQuery({
    ...teamMembershipQuery(client, org ?? "", teamRole("ta"), username ?? ""),
    enabled: Boolean(org && classroom && username),
  })
  const studentQuery = useQuery({
    ...teamMembershipQuery(client, org ?? "", studentSlug, username ?? ""),
    enabled: Boolean(org && classroom && username),
  })

  // owner = active org admin. A success or a 404/403 both give a concrete
  // true/false; only an in-flight/transient read leaves it `undefined`, which
  // the resolver holds as `unresolved`.
  const ownerErrorIsDefinitive =
    ownerQuery.error instanceof GitHubAPIError &&
    (ownerQuery.error.status === 404 || ownerQuery.error.status === 403)
  const isOwner =
    ownerQuery.data?.state === "active" && ownerQuery.data.role === "admin"
      ? true
      : ownerQuery.isSuccess || ownerErrorIsDefinitive
        ? false
        : undefined

  // Classroom role is decided by team membership alone (config-repo access no
  // longer gates it — that repo is org-wide and can't tell classrooms apart).
  const actualRole = resolveClassroomRole({
    org,
    classroom,
    isOwner,
    instructor: membershipFromQuery(
      instructorQuery.isSuccess,
      instructorQuery.error,
    ),
    ta: membershipFromQuery(taQuery.isSuccess, taQuery.error),
    student: membershipFromQuery(studentQuery.isSuccess, studentQuery.error),
  })

  // Apply the "view as" preview (downgrade-only; never escalates).
  const role = applyViewAs(actualRole, viewAs)

  // Only count a query as loading when it's actually fetching — a DISABLED query
  // (e.g. team reads on an org-level route) is `pending` but idle and must not
  // pin the guard's spinner.
  const isLoading =
    ownerQuery.fetchStatus === "fetching" ||
    instructorQuery.fetchStatus === "fetching" ||
    taQuery.fetchStatus === "fetching" ||
    studentQuery.fetchStatus === "fetching"

  return { role, actualRole, isLoading }
}
