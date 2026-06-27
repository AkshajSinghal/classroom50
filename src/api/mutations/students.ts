import Papa from "papaparse"
import type { GitHubClient } from "@/hooks/github/client"
import {
  addUserToTeam,
  archiveRepo,
  createGitCommit,
  createGitTree,
  createOrgInvitation,
  deleteRepo,
  ensureOrgMembership,
  getErrorMessage,
  getOrgMembershipState,
  removeOrgMembership,
  removeUserFromTeam,
  updateRef,
} from "@/hooks/github/mutations"
import { withGitConflictRetry, type CreateClassroomResult } from "./classrooms"
import {
  getFileCommitAuthorIds,
  getRawFile,
  getRepoFile,
  getUser,
  listOnboardingRepos,
  ONBOARDING_READ_CONCURRENCY,
} from "@/hooks/github/queries"
import { getAuthenticatedUser } from "@/api/queries/users"
import { getBranchRef, getClassroomJson, getCommit } from "../github/queries"
import { GitHubAPIError } from "@/hooks/github/errors"
import { isSameGitHubUser } from "@/util/students"
import {
  emailHash,
  generateInviteToken,
  isReconcilableRow,
  isValidInviteToken,
  onboardingRepoPrefixForGithubId,
  ONBOARDING_YAML_PATH,
  payloadEmailMatchesRow,
} from "@/util/onboarding"
import { parseOnboardingYaml } from "@/util/yaml"
import { mapWithConcurrency } from "@/util/concurrency"
import {
  DEFAULT_ONBOARDING_CLEANUP,
  type OnboardingCleanupMode,
  type Student,
} from "@/types/classroom"

// The classroom team slug is authoritative in classroom.json: on a name
// collision GitHub may assign a slug other than `classroom50-<slug>`, so
// re-deriving it can target the wrong team. The derived form is only correct
// when classroom.json genuinely lacks a team block (a read with no `team`, or a
// 404 = pre-feature classroom). A transient read failure is NOT "no team" —
// propagate it so the caller reports an actionable failure instead of silently
// targeting a possibly-wrong slug.
async function resolveClassroomTeamSlug(
  client: GitHubClient,
  org: string,
  classroom: string,
): Promise<string> {
  return (await resolveClassroomTeam(client, org, classroom)).slug
}

// Both the slug and numeric id of the classroom team from a SINGLE classroom.json
// read. The slug follows the collision handling above (404 -> derived slug;
// other errors propagate); the id degrades to undefined when absent. Callers
// that only need the slug go through resolveClassroomTeamSlug; callers that want
// a best-effort id (e.g. team_ids on an invite) catch the throw into undefined.
async function resolveClassroomTeam(
  client: GitHubClient,
  org: string,
  classroom: string,
): Promise<{ slug: string; id?: number }> {
  try {
    const classroomJson = await getClassroomJson(client, { org, classroom })
    if (classroomJson.team?.slug) {
      return { slug: classroomJson.team.slug, id: classroomJson.team.id }
    }
  } catch (err) {
    if (!(err instanceof GitHubAPIError && err.isNotFound)) {
      throw err
    }
  }
  return { slug: `classroom50-${classroom}` }
}

export type AddStudentToClassroomResult = CreateClassroomResult & {
  student: StudentCsvRow
  // Set when the student was added to the roster (committed) but the
  // follow-up team add failed — a non-fatal warning (no private-template read
  // until retried). Mirrors the bulk path's teamResults / teamDeleteWarning.
  teamWarning?: string
}

export const STUDENT_CSV_FIELDS = [
  "username",
  "first_name",
  "last_name",
  "email",
  "section",
  "github_id",
  // Email-first onboarding columns. Appended after the original 6 so old
  // header-based CSVs still parse (missing columns default to "" below) and
  // new columns are additive.
  "enrollment_status",
  "enrollment_method",
  "email_hash",
  "invite_token",
  "invited_at",
  "enrolled_at",
] as const
type StudentCsvField = (typeof STUDENT_CSV_FIELDS)[number]

export type StudentCsvRow = Record<StudentCsvField, string>

function normalizeStudentRow(
  row: Partial<Record<StudentCsvField, unknown>>,
): StudentCsvRow {
  return {
    username: String(row.username ?? "").trim(),
    first_name: String(row.first_name ?? "").trim(),
    last_name: String(row.last_name ?? "").trim(),
    email: String(row.email ?? "").trim(),
    section: String(row.section ?? "").trim(),
    github_id: String(row.github_id ?? "").trim(),
    enrollment_status: String(row.enrollment_status ?? "").trim(),
    enrollment_method: String(row.enrollment_method ?? "").trim(),
    email_hash: String(row.email_hash ?? "").trim(),
    invite_token: String(row.invite_token ?? "").trim(),
    invited_at: String(row.invited_at ?? "").trim(),
    enrolled_at: String(row.enrolled_at ?? "").trim(),
  }
}

function splitGitHubDisplayName(name: string | null) {
  if (!name?.trim()) {
    return { first_name: "", last_name: "" }
  }

  const parts = name.trim().split(/\s+/)
  const first_name = parts[0] ?? ""
  const last_name = parts.slice(1).join(" ")

  return { first_name, last_name }
}

function parseStudentsCsv(csv: string): StudentCsvRow[] {
  const parsed = Papa.parse<Record<string, string>>(csv, {
    header: true,
    delimiter: ",",
    skipEmptyLines: "greedy",
    transformHeader: (header) => header.trim(),
  })

  const fatalErrors = parsed.errors.filter(
    (error) => error.type !== "Delimiter",
  )

  if (fatalErrors.length > 0) {
    throw new Error(
      `Could not parse students.csv: ${parsed.errors
        .map((error) => error.message)
        .join("; ")}`,
    )
  }

  return parsed.data
    .map((row) => normalizeStudentRow(row))
    .filter((row) => row.username || row.github_id || row.email)
}

function stringifyStudentsCsv(rows: StudentCsvRow[]) {
  const normalizedRows = rows
    .map((row) => normalizeStudentRow(row))
    .filter((row) => row.username || row.github_id || row.email)

  return (
    Papa.unparse(normalizedRows, {
      columns: [...STUDENT_CSV_FIELDS],
      delimiter: ",",
      header: true,
      newline: "\n",
    }) + "\n"
  )
}

export async function addStudentToClassroom(
  client: GitHubClient,
  input: AddStudentToClassroomInput,
): Promise<AddStudentToClassroomResult> {
  const normalizedUsername = input.username.trim()

  if (!normalizedUsername) {
    throw new Error("GitHub username is required")
  }

  const ref = await getBranchRef(client, input.org)
  const commit = await getCommit(client, input.org, ref.object.sha)

  const studentsFilePath = `${input.classroom}/students.csv`

  const currentCsv = await getRawFile(client, {
    org: input.org,
    path: studentsFilePath,
    ref: ref.object.sha,
  })

  const githubUser = await getUser(client, normalizedUsername)
  const currentStudents = parseStudentsCsv(currentCsv)

  const alreadyExists = currentStudents.some(
    (student) =>
      student.username.toLowerCase() === githubUser.login.toLowerCase() ||
      student.github_id === String(githubUser.id),
  )

  if (alreadyExists) {
    throw new Error(`Student already exists: ${githubUser.login}`)
  }

  const nameParts = splitGitHubDisplayName(githubUser.name)

  const studentEmail = input.email?.trim() ?? githubUser.email ?? ""

  const student: StudentCsvRow = normalizeStudentRow({
    username: githubUser.login,
    first_name: input.first_name?.trim() ?? nameParts.first_name,
    last_name: input.last_name?.trim() ?? nameParts.last_name,
    email: studentEmail,
    section: input.section?.trim() ?? "",
    github_id: String(githubUser.id),
    // Even a username-add still onboards (to supply name/email via the
    // onboarding repo), so it starts "invited" and the onboarding reconcile
    // flips it to "enrolled". The email_hash is cached when we know an email
    // so reconcile can match the self-report by email if needed.
    enrollment_status: "invited",
    enrollment_method: "github",
    email_hash: studentEmail ? await emailHash(studentEmail) : "",
    // Mint a unique invite token so a per-student secure onboarding link always
    // exists (used as reconcile's strongest match key when the student onboards
    // through it; otherwise reconcile falls back to github_id / email).
    invite_token: generateInviteToken(),
    invited_at: new Date().toISOString(),
  })

  const nextStudents = [...currentStudents, student]
  const nextCsv = stringifyStudentsCsv(nextStudents)

  const tree = await createGitTree(client, {
    org: input.org,
    base_tree: commit.tree.sha,
    tree: [
      {
        path: studentsFilePath,
        mode: "100644",
        type: "blob",
        content: nextCsv,
      },
    ],
  })

  const newCommit = await createGitCommit(client, {
    org: input.org,
    message: `Add student: ${input.classroom}/${student.username}`,
    tree_sha: tree.sha,
    parents: [ref.object.sha],
  })

  const updatedRef = await updateRef(client, input.org, newCommit.sha)

  return {
    previousCommitSha: ref.object.sha,
    baseTreeSha: commit.tree.sha,
    newTreeSha: tree.sha,
    newCommitSha: newCommit.sha,
    updatedRef,
    student,
  }
}

export async function addStudentToClassroomWithConflictRetry(
  client: GitHubClient,
  input: AddStudentToClassroomInput,
) {
  return withGitConflictRetry(() => addStudentToClassroom(client, input))
}

type AddEmailInviteToClassroomInput = {
  org: string
  classroom: string
  email: string
  first_name?: string
  last_name?: string
  section?: string
}

// Email-first enrolment writer. Unlike addStudentToClassroom, there is no
// GitHub username/id to resolve yet — the row is keyed on the invited email and
// stays in the "invited" lifecycle state until the student self-reports via the
// onboarding repo and the teacher reconciles. Reuses the same git tree/commit/
// updateRef machinery; dedupes on email (case-insensitive).
export async function addEmailInviteToClassroom(
  client: GitHubClient,
  input: AddEmailInviteToClassroomInput,
): Promise<AddStudentToClassroomResult> {
  const normalizedEmail = input.email.trim()

  if (!normalizedEmail) {
    throw new Error("Email is required")
  }

  const ref = await getBranchRef(client, input.org)
  const commit = await getCommit(client, input.org, ref.object.sha)

  const studentsFilePath = `${input.classroom}/students.csv`

  const currentCsv = await getRawFile(client, {
    org: input.org,
    path: studentsFilePath,
    ref: ref.object.sha,
  })

  const currentStudents = parseStudentsCsv(currentCsv)

  const emailKey = normalizedEmail.toLowerCase()
  const alreadyExists = currentStudents.some(
    (student) => student.email.toLowerCase() === emailKey,
  )

  if (alreadyExists) {
    throw new Error(`Student already exists: ${normalizedEmail}`)
  }

  const student: StudentCsvRow = normalizeStudentRow({
    username: "",
    first_name: input.first_name?.trim() ?? "",
    last_name: input.last_name?.trim() ?? "",
    email: normalizedEmail,
    section: input.section?.trim() ?? "",
    github_id: "",
    enrollment_status: "invited",
    enrollment_method: "email",
    email_hash: await emailHash(normalizedEmail),
    // Every student gets a unique invite token by default so a per-student
    // secure onboarding link always exists. If the student uses that link, the
    // token is written into the self-report YAML and is reconcile's strongest
    // match key; if they use the classroom-wide link instead, reconcile simply
    // falls back to github_id then email. The token never names the repo.
    invite_token: generateInviteToken(),
    invited_at: new Date().toISOString(),
    enrolled_at: "",
  })

  const nextStudents = [...currentStudents, student]
  const nextCsv = stringifyStudentsCsv(nextStudents)

  const tree = await createGitTree(client, {
    org: input.org,
    base_tree: commit.tree.sha,
    tree: [
      {
        path: studentsFilePath,
        mode: "100644",
        type: "blob",
        content: nextCsv,
      },
    ],
  })

  const newCommit = await createGitCommit(client, {
    org: input.org,
    message: `Invite student by email: ${input.classroom}/${normalizedEmail}`,
    tree_sha: tree.sha,
    parents: [ref.object.sha],
  })

  const updatedRef = await updateRef(client, input.org, newCommit.sha)

  return {
    previousCommitSha: ref.object.sha,
    baseTreeSha: commit.tree.sha,
    newTreeSha: tree.sha,
    newCommitSha: newCommit.sha,
    updatedRef,
    student,
  }
}

export async function addEmailInviteToClassroomWithConflictRetry(
  client: GitHubClient,
  input: AddEmailInviteToClassroomInput,
) {
  return withGitConflictRetry(() => addEmailInviteToClassroom(client, input))
}

export type InviteStudentByEmailResult = AddStudentToClassroomResult & {
  // Set when the roster row committed but the org email-invite failed (a
  // non-fatal warning, mirroring enrollStudentInClassroom).
  inviteWarning?: string
}

// Commit the email-only roster row first (authoritative), then best-effort fire
// the org email-invite. A failed invite is a non-fatal warning since the row
// already landed — the teacher can re-send from the roster.
export async function inviteStudentByEmail(
  client: GitHubClient,
  input: AddEmailInviteToClassroomInput,
): Promise<InviteStudentByEmailResult> {
  const result = await addEmailInviteToClassroomWithConflictRetry(client, input)

  // Add the classroom team to the invite so the student lands in it directly on
  // acceptance (no separate team-add needed). Best-effort: if the team id can't
  // be resolved, send the invite without it and reconcile adds them later.
  const teamId = await resolveClassroomTeam(client, input.org, input.classroom)
    .then((team) => team.id)
    .catch(() => undefined)

  try {
    await createOrgInvitation(client, {
      org: input.org,
      email: result.student.email,
      team_ids: teamId ? [teamId] : undefined,
    })
  } catch (err) {
    console.error("org email invite failed (row committed):", err)
    const detail = getErrorMessage(err)
    return {
      ...result,
      inviteWarning:
        `${result.student.email} was added to the roster, but sending their ` +
        `organization invite failed (${detail}); re-send it from the roster.`,
    }
  }

  return result
}

export type ReconcileOnboardingResult = {
  // Rows newly bound to a GitHub identity this run.
  reconciled: { email: string; username: string }[]
  // Reconcilable rows for which no matching onboarding self-report was found
  // (student hasn't onboarded yet).
  pending: string[]
  // Onboarding repos found but whose payload couldn't be parsed/verified, or
  // verified self-reports that matched no roster row.
  unmatched: { repo: string; reason: string }[]
  // Verified self-reports whose identity matched no roster row at all (e.g. a
  // student who joined via a raw org link and is in no students.csv row).
  // Reported as a count for teacher awareness; no automatic roster add (the
  // manual reconciliation UI is out of scope).
  needsAttention: { github_id: string; login: string }[]
  // Onboarding repos archived after a successful reconcile.
  archived: string[]
  // Onboarding repos deleted after a successful reconcile.
  deleted: string[]
  // Set when cleanup couldn't honor the configured mode (e.g. delete fell back
  // to archive for lack of the delete_repo scope), so the teacher can act.
  cleanupWarning?: string
}

// Teacher-side reconciliation: list every onboarding repo in the org, read each
// self-report YAML, verify the writer's GitHub-attested identity, and fold it
// into the matching roster row. The repo name carries a browser-random suffix
// the teacher can't recompute, so matching is driven entirely by the YAML
// payload contents (invite_token, then github_id, then email) — never by the
// repo name. All updates land in ONE students.csv commit (wrapped in
// withGitConflictRetry) so a batch reconcile is a single race window, not N.
export async function reconcileOnboarding(
  client: GitHubClient,
  input: { org: string; classroom: string },
): Promise<ReconcileOnboardingResult> {
  const { org, classroom } = input
  const studentsFilePath = `${classroom}/students.csv`

  const result: ReconcileOnboardingResult = {
    reconciled: [],
    pending: [],
    unmatched: [],
    needsAttention: [],
    archived: [],
    deleted: [],
  }

  // Per-classroom cleanup mode. A 404 (no classroom.json — a pre-feature
  // classroom) is a genuine "unset", so we keep the configured default. Any
  // OTHER read failure is transient (rate limit, 5xx, network) and must NOT be
  // misread as "unset": defaulting to delete on a blip would irreversibly
  // delete onboarding repos on a classroom the teacher explicitly set to
  // keep/archive. So on a non-404 failure fall back to the SAFE "keep" mode and
  // surface a warning, mirroring resolveClassroomTeamSlug's "a transient read
  // failure is NOT 'no team'" handling. Cleanup can be retried once the read
  // recovers; an unwanted deletion cannot be undone.
  let cleanupMode: OnboardingCleanupMode = DEFAULT_ONBOARDING_CLEANUP
  try {
    const classroomJson = await getClassroomJson(client, { org, classroom })
    if (classroomJson.onboarding_cleanup) {
      cleanupMode = classroomJson.onboarding_cleanup
    }
  } catch (err) {
    if (!(err instanceof GitHubAPIError && err.isNotFound)) {
      cleanupMode = "keep"
      result.cleanupWarning =
        "Couldn't read the classroom cleanup setting, so onboarding repos were " +
        "kept (not deleted or archived) to avoid an unintended deletion. " +
        "Re-run reconcile once the connection recovers to clean them up."
    }
    // A 404 means no classroom.json (pre-feature); keep the configured default.
  }

  // Read the roster once (outside the retry) to drive matching.
  const headRef = await getBranchRef(client, org)
  const roster = parseStudentsCsv(
    await getRawFile(client, {
      org,
      path: studentsFilePath,
      ref: headRef.object.sha,
    }),
  )

  // Reconcilable rows are the match targets; an already-enrolled row is never
  // re-matched. Matched below by linear scan (a classroom's target set is small),
  // strongest key first: invite_token, then github_id, then email.
  const targets = roster.filter(isReconcilableRow)

  // A verified self-report that matched a roster target. We match each roster
  // row to at most one self-report, and each self-report to at most one row;
  // `matchBy`/`matchValue` record how the row was found so the batched commit
  // phase can re-find the SAME row deterministically (no drift).
  type Resolved = {
    repo: string
    username: string
    github_id: string
    email: string
    first_name: string
    last_name: string
    matchBy: "token" | "github_id" | "email"
    matchValue: string
  }
  const resolved: Resolved[] = []
  // Guards so two self-reports can't both claim the same roster row, and one
  // self-report can't be applied twice.
  const claimedGithubIds = new Set<string>()
  const claimedRows = new Set<StudentCsvRow>()
  // Redundant onboarding repos for an already-claimed github_id (e.g. a student
  // re-onboarded, leaving a second repo). Cleaned up alongside the reconciled
  // repos so they don't linger as orphans that re-surface every run.
  const redundantRepos: string[] = []

  const onboardingRepos = await listOnboardingRepos(client, org)

  // Read every onboarding repo's self-report YAML up front, bounded-parallel:
  // the per-repo read is the dominant cost and was previously serial. A missing
  // YAML (404) means the repo exists but its commit hasn't landed — skip it
  // quietly; any other read error is a real problem on an existing repo.
  type RepoRead = {
    repo: string
    payload?: ReturnType<typeof parseOnboardingYaml>
    readError?: string
  }
  const reads: RepoRead[] = await mapWithConcurrency(
    onboardingRepos,
    ONBOARDING_READ_CONCURRENCY,
    async (repoMeta): Promise<RepoRead> => {
      const repo = repoMeta.name
      try {
        return {
          repo,
          payload: parseOnboardingYaml(
            await getRepoFile(client, org, repo, ONBOARDING_YAML_PATH),
          ),
        }
      } catch (err) {
        if (err instanceof GitHubAPIError && err.isNotFound) {
          return { repo }
        }
        return { repo, readError: getErrorMessage(err) }
      }
    },
  )

  // Resolve sequentially: matching uses the claimedRows/claimedGithubIds sets,
  // whose order-dependent "first verified self-report wins" semantics must not
  // race. The expensive reads already happened in parallel above.
  for (const { repo, payload, readError } of reads) {
    if (readError !== undefined) {
      result.unmatched.push({ repo, reason: readError })
      continue
    }
    if (!payload) {
      // 404 read -> repo exists but YAML not committed yet; nothing to do.
      continue
    }

    // Only this classroom's self-reports are reconciled here; the YAML carries
    // the classroom (the org-level repo name does not), so a student enrolled
    // in multiple classrooms of one org has a distinct repo per onboarding and
    // each classroom's reconcile only folds in its own.
    if (payload.classroom !== classroom) {
      continue
    }

    // Trust the payload identity only if the account that wrote the self-report
    // IS the account it claims. The commit author/committer id is GitHub-
    // attested; this is what makes the unguessable repo name safe — a squatter
    // can't forge another student's identity into a self-report. Distinguish a
    // transient read failure (retryable; surfaced as unmatched-but-not-a-
    // mismatch) from a genuine identity mismatch (a security signal): on a
    // transient failure we skip without asserting forgery.
    let authorIds: number[]
    try {
      authorIds = await getFileCommitAuthorIds(
        client,
        org,
        repo,
        ONBOARDING_YAML_PATH,
      )
    } catch (err) {
      result.unmatched.push({
        repo,
        reason: `couldn't verify the self-report author (${getErrorMessage(err)}); retry reconcile`,
      })
      continue
    }
    if (!authorIds.includes(payload.github_id)) {
      result.unmatched.push({
        repo,
        reason: `self-report identity (${payload.github_username}) does not match the account that wrote it`,
      })
      continue
    }

    const payloadId = String(payload.github_id)
    if (claimedGithubIds.has(payloadId)) {
      // A second verified self-report from the same account for this classroom
      // (e.g. a re-onboard that left a duplicate repo). The first one already
      // bound the roster row; this repo is redundant — route it to cleanup so
      // it doesn't linger as an orphan the next run re-encounters.
      redundantRepos.push(repo)
      continue
    }

    // Match the verified self-report back to a roster row, strongest key first:
    //   1. invite_token  — unguessable, issued by the teacher for one row; the
    //      student presents it in the YAML only if they used the secure link.
    //   2. github_id     — immutable; binds a username-invited row (which
    //      carries github_id) and any row already partially resolved.
    //   3. email         — last resort (payloadEmailMatchesRow); the path an
    //      email-invited student takes when they onboard via the classroom-wide
    //      link (their row has no github_id yet and the YAML has no token).
    // A row is matched at most once (claimedRows), so a self-report can't steal
    // a row another already took; the row merely HAVING a token/github_id column
    // does not exclude it from the email path (every row now carries a token).
    const token =
      payload.invite_token && isValidInviteToken(payload.invite_token)
        ? payload.invite_token.trim()
        : undefined

    let matched:
      | { row: StudentCsvRow; by: Resolved["matchBy"]; value: string }
      | undefined

    if (token) {
      const row = targets.find(
        (r) => !claimedRows.has(r) && r.invite_token === token,
      )
      if (row) matched = { row, by: "token", value: token }
    }
    if (!matched) {
      const row = targets.find(
        (r) => !claimedRows.has(r) && r.github_id === payloadId,
      )
      if (row) matched = { row, by: "github_id", value: payloadId }
    }
    if (!matched) {
      // Email is the last-resort key, for a genuinely email-first row (no
      // token and no github_id yet) whose student onboarded via the
      // classroom-wide link. Constraints that close known abuse/ambiguity:
      //  - The row must actually carry an email key (email_hash or email);
      //    otherwise payloadEmailMatchesRow returns true by fallthrough and an
      //    unrelated self-report would bind to a keyless row.
      //  - If 2+ unclaimed rows match the same self-reported email, the bind is
      //    ambiguous — route to needsAttention rather than guessing a row.
      // The claimed email is attacker-supplied (only github_id is GitHub-
      // attested), so this path is the accepted residual risk for students who
      // skip their unique secure link; token/github_id matches are unaffected.
      const emailCandidates: StudentCsvRow[] = []
      for (const row of targets) {
        if (claimedRows.has(row)) continue
        if (row.invite_token || row.github_id) continue
        if (!row.email_hash && !row.email.trim()) continue
        if (await payloadEmailMatchesRow(payload.email, row)) {
          emailCandidates.push(row)
        }
      }
      if (emailCandidates.length === 1) {
        const row = emailCandidates[0]
        // Stable email key for the commit phase: the row's email_hash, or one
        // derived from its email so re-matching after the CSV re-read agrees.
        const emailKey = row.email_hash || (await emailHash(row.email))
        matched = { row, by: "email", value: emailKey }
      } else if (emailCandidates.length > 1) {
        result.unmatched.push({
          repo,
          reason: `self-report email (${payload.email}) matches ${emailCandidates.length} roster rows; resolve the duplicate emails or send the student their secure link`,
        })
        continue
      }
    }

    if (!matched) {
      // Verified, but no roster row to bind to: a student who joined via a raw
      // link / is in no students.csv row. Surface for teacher awareness; no
      // automatic roster add this pass.
      result.needsAttention.push({
        github_id: payloadId,
        login: payload.github_username,
      })
      continue
    }

    claimedGithubIds.add(payloadId)
    claimedRows.add(matched.row)
    resolved.push({
      repo,
      username: payload.github_username,
      github_id: payloadId,
      email: payload.email,
      first_name: payload.first_name,
      last_name: payload.last_name,
      matchBy: matched.by,
      matchValue: matched.value,
    })
    result.reconciled.push({
      email: matched.row.email || payload.email,
      username: payload.github_username,
    })
  }

  // Compute the value a given row presents for a given match kind, so a
  // resolved entry can be re-bound to the same logical row by its matchBy/
  // matchValue. Every row may carry a token, a github_id, AND an email, so all
  // three keys are computed unconditionally (the earlier "only email rows get
  // an email key" assumption broke once every row gained a default token).
  const rowKeyForMatchBy = async (
    row: StudentCsvRow,
    matchBy: Resolved["matchBy"],
  ): Promise<string | undefined> => {
    if (matchBy === "token") return row.invite_token || undefined
    if (matchBy === "github_id") return row.github_id || undefined
    return (
      row.email_hash || (row.email ? await emailHash(row.email) : undefined)
    )
  }

  const rowMatchesResolved = async (
    row: StudentCsvRow,
    r: Resolved,
  ): Promise<boolean> => {
    const key = await rowKeyForMatchBy(row, r.matchBy)
    return key !== undefined && key === r.matchValue
  }

  // Reconcilable rows with no matching self-report this run = not onboarded yet.
  for (const row of targets) {
    let isResolved = false
    for (const r of resolved) {
      if (await rowMatchesResolved(row, r)) {
        isResolved = true
        break
      }
    }
    if (!isResolved) {
      result.pending.push(row.email || row.username)
    }
  }

  // Nothing to bind into the roster this run. Redundant duplicate repos only
  // accumulate when a github_id was resolved this run (so resolved is non-empty
  // whenever redundantRepos is), meaning there's genuinely nothing to do here.
  if (resolved.length === 0) {
    return result
  }

  // The resolved entries actually written to the roster this run. Populated in
  // the commit phase below: a resolved entry is only "committed" when it bound
  // to a freshly-read row that wasn't already enrolled. Team-add and repo
  // cleanup are driven from THIS set (not the full resolved[]), so a repo whose
  // row was already enrolled, or that failed to re-bind after the CSV re-read,
  // is never deleted/archived for work that didn't land.
  let committed: Resolved[] = []

  // Single batched commit. Re-reads the roster inside the retry so it applies
  // onto the latest students.csv even if another write landed meanwhile.
  await withGitConflictRetry(async () => {
    const ref = await getBranchRef(client, org)
    const commit = await getCommit(client, org, ref.object.sha)
    const current = parseStudentsCsv(
      await getRawFile(client, {
        org,
        path: studentsFilePath,
        ref: ref.object.sha,
      }),
    )

    // Re-bind each resolved self-report to the freshly-read row by its recorded
    // match key (the resolve-phase row objects differ after the re-read). Uses
    // the shared rowKeyForMatchBy so resolve and commit phases can't drift.
    const matchByRow = new Map<StudentCsvRow, Resolved>()
    for (const row of current) {
      for (const r of resolved) {
        const key = await rowKeyForMatchBy(row, r.matchBy)
        if (key !== undefined && key === r.matchValue) {
          matchByRow.set(row, r)
          break
        }
      }
    }

    // Reset per attempt (withGitConflictRetry may re-run this block on a 409).
    const committedThisAttempt: Resolved[] = []
    const now = new Date().toISOString()
    const next = current.map((row) => {
      const match = matchByRow.get(row)
      if (!match || row.enrollment_status === "enrolled") {
        return row
      }
      committedThisAttempt.push(match)
      // Fill-missing: keep teacher-entered values, fall back to the student's
      // self-reported name/email so the roster ends up complete.
      return normalizeStudentRow({
        ...row,
        username: match.username,
        github_id: match.github_id,
        email: row.email || match.email,
        first_name: row.first_name || match.first_name,
        last_name: row.last_name || match.last_name,
        enrollment_status: "enrolled",
        enrolled_at: now,
      })
    })

    if (committedThisAttempt.length === 0) {
      // Nothing new to write (e.g. every match was already enrolled); skip the
      // commit so we don't push an empty/no-op change, and clear the committed
      // set so cleanup touches nothing.
      committed = []
      return
    }

    const nextCsv = stringifyStudentsCsv(next)

    const tree = await createGitTree(client, {
      org,
      base_tree: commit.tree.sha,
      tree: [
        {
          path: studentsFilePath,
          mode: "100644",
          type: "blob",
          content: nextCsv,
        },
      ],
    })

    const newCommit = await createGitCommit(client, {
      org,
      message: `Reconcile onboarding: ${classroom} (${committedThisAttempt.length} student${
        committedThisAttempt.length === 1 ? "" : "s"
      })`,
      tree_sha: tree.sha,
      parents: [ref.object.sha],
    })

    await updateRef(client, org, newCommit.sha)
    committed = committedThisAttempt
  })

  // Add reconciled students to the classroom team so they get read on private
  // in-org templates. This is now a best-effort fallback: both invite flows
  // already attach the classroom team_ids to the org invitation, so an accepted
  // student is usually on the team before reconcile runs. It still covers a
  // student whose invite predated team_ids, or whose acceptance hadn't activated
  // the team membership yet. Best-effort: a failure here is non-fatal since the
  // roster row already landed. Resolve the slug once; on a resolve failure, skip
  // team adds entirely (can't target a team) but still proceed to cleanup.
  let teamSlug: string | undefined
  try {
    teamSlug = await resolveClassroomTeamSlug(client, org, classroom)
  } catch (err) {
    result.unmatched.push({
      repo: "(team)",
      reason: `reconciled, but resolving the classroom team failed (${getErrorMessage(err)}); team membership not added`,
    })
  }

  if (teamSlug) {
    for (const { username } of committed) {
      try {
        await addUserToTeam(client, {
          org,
          teamSlug,
          username,
          role: "member",
        })
      } catch (err) {
        result.unmatched.push({
          repo: `(team:${username})`,
          reason: `reconciled, but adding to the classroom team failed (${getErrorMessage(err)})`,
        })
      }
    }
  }

  // Cleanup runs ONLY after the CSV commit above succeeded, for the repos whose
  // row was actually written this run (committed) PLUS redundant duplicate repos
  // for an already-enrolled github_id. A repo whose write didn't land, or whose
  // row was already enrolled, is never touched. The mode is per-classroom
  // (default "delete"); failures are non-fatal. Never touch unmatched/pending.
  const reposToCleanup = [...committed.map((c) => c.repo), ...redundantRepos]
  if (cleanupMode !== "keep" && reposToCleanup.length > 0) {
    let deleteScopeMissing = false

    for (const repo of reposToCleanup) {
      // "delete" needs the delete_repo scope (now requested by default, but an
      // older session's token may lack it); on a 403 we fall back to archiving
      // so cleanup still happens, and warn once so the teacher knows to
      // re-authorize.
      if (cleanupMode === "delete" && !deleteScopeMissing) {
        try {
          await deleteRepo(client, { owner: org, repo })
          result.deleted.push(repo)
          continue
        } catch (err) {
          if (err instanceof GitHubAPIError && err.isForbidden) {
            deleteScopeMissing = true
            // fall through to archive
          } else {
            result.unmatched.push({
              repo,
              reason: `reconciled but delete failed: ${getErrorMessage(err)}`,
            })
            continue
          }
        }
      }

      try {
        await archiveRepo(client, { owner: org, repo })
        result.archived.push(repo)
      } catch (err) {
        result.unmatched.push({
          repo,
          reason: `reconciled but archive failed: ${getErrorMessage(err)}`,
        })
      }
    }

    if (deleteScopeMissing) {
      result.cleanupWarning =
        "Cleanup is set to delete, but your current session isn't authorized to " +
        "delete repositories, so the onboarding repos were archived instead. " +
        "Sign out and back in to grant the delete permission, or change the " +
        "classroom cleanup setting to archive."
    }
  }

  return result
}

type AddStudentToClassroomInput = {
  org: string
  classroom: string
  username: string

  first_name?: string
  last_name?: string
  email?: string
  section?: string
}
export async function enrollStudentInClassroom(
  client: GitHubClient,
  input: AddStudentToClassroomInput,
) {
  const { org, classroom } = input
  // Resolve the classroom team (slug + id) once, concurrently with the roster
  // commit — a single classroom.json read for both values. It can reject on a
  // transient read; attach a catch to avoid an unhandled rejection.
  const teamPromise = resolveClassroomTeam(client, org, classroom)
  teamPromise.catch(() => {})
  const result = await addStudentToClassroomWithConflictRetry(client, input)

  // CLI order: roster row -> membership -> team. Membership/team failures are
  // non-fatal warnings since the commit already landed.
  const warnings: string[] = []

  // Ensure org membership via the numeric github_id resolved during the roster
  // write. Pass the classroom team id so a freshly-created invite carries it:
  // accepting the single org invitation then activates team membership too
  // (otherwise a separate team-add leaves the student team-pending until they
  // accept a second, separate team invite). ensureOrgMembership prechecks and
  // swallows the benign already-member/already-pending 422.
  const inviteeId = Number(result.student.github_id)
  if (Number.isFinite(inviteeId) && inviteeId > 0) {
    try {
      const teamId = (await teamPromise).id
      await ensureOrgMembership(client, {
        org,
        username: result.student.username,
        inviteeId,
        teamIds: teamId ? [teamId] : undefined,
      })
    } catch (err) {
      console.error("org invite failed (student enrolled):", err)
      const detail = getErrorMessage(err)
      warnings.push(
        `${result.student.username} was added to the roster, but sending their ` +
          `organization invite failed (${detail}); re-send it from the roster.`,
      )
    }
  }

  // Fallback team-add: covers an already-org-member student (where the invite
  // above was a no-op and so carried no team_ids). Idempotent for a student the
  // invite already placed on the team.
  try {
    const teamSlug = (await teamPromise).slug
    await addUserToTeam(client, {
      org,
      teamSlug,
      username: result.student.username,
      role: "member",
    })
  } catch (err) {
    console.error("team add failed (student enrolled):", err)
    const detail = getErrorMessage(err)
    warnings.push(
      `${result.student.username} was added to the roster, but adding them to ` +
        `the classroom team failed (${detail}); they won't have read on private ` +
        `templates until it's retried.`,
    )
  }

  return {
    ...result,
    teamWarning: warnings.length > 0 ? warnings.join(" ") : undefined,
  }
}

type BulkImportProgress = {
  processed: number
  total: number
  message: string
}
export type AddStudentsToClassroomInput = {
  org: string
  classroom: string
  usernames: string[]
  onProgress?: (progress: BulkImportProgress) => void
}

export type AddStudentsToClassroomResult = CreateClassroomResult & {
  addedStudents: StudentCsvRow[]
  skippedStudents: {
    username: string
    reason: "duplicate" | "not_found" | "invalid" | "error"
    message?: string
  }[]
}

export const normalizeGithubUsername = (username: string) => {
  return username.trim().replace(/^@/, "")
}

export const isLikelyGithubUsername = (username: string) => {
  // alphanumeric + hyphens, no hyphens at start or end
  return /^[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,37}[a-zA-Z0-9])?$/.test(username)
}

export async function addStudentsToClassroom(
  client: GitHubClient,
  input: AddStudentsToClassroomInput,
): Promise<AddStudentsToClassroomResult> {
  const normalizedUsernames = Array.from(
    new Map(
      input.usernames
        .map((username) => normalizeGithubUsername(username))
        .filter(Boolean)
        .map((username) => [username.toLowerCase(), username]),
    ).values(),
  )

  if (normalizedUsernames.length === 0) {
    throw new Error("At least one GitHub username is required")
  }

  input.onProgress?.({
    processed: 0,
    total: normalizedUsernames.length,
    message: "Reading current students.csv...",
  })

  const ref = await getBranchRef(client, input.org)
  const commit = await getCommit(client, input.org, ref.object.sha)

  const studentsFilePath = `${input.classroom}/students.csv`

  const currentCsv = await getRawFile(client, {
    org: input.org,
    path: studentsFilePath,
    ref: ref.object.sha,
  })

  const currentStudents = parseStudentsCsv(currentCsv)

  const existingUsernameKeys = new Set(
    currentStudents.map((student) => student.username.toLowerCase()),
  )

  const existingGithubIds = new Set(
    currentStudents.map((student) => student.github_id).filter(Boolean),
  )

  const skippedStudents: AddStudentsToClassroomResult["skippedStudents"] = []
  const addedStudents: StudentCsvRow[] = []

  let processed = 0

  for (const username of normalizedUsernames) {
    input.onProgress?.({
      processed,
      total: normalizedUsernames.length,
      message: `Checking ${username}...`,
    })

    if (!isLikelyGithubUsername(username)) {
      skippedStudents.push({
        username,
        reason: "invalid",
        message: "Invalid GitHub username",
      })

      processed++
      continue
    }

    if (existingUsernameKeys.has(username.toLowerCase())) {
      skippedStudents.push({
        username,
        reason: "duplicate",
        message: "Student is already in students.csv",
      })

      processed++
      continue
    }

    try {
      const githubUser = await getUser(client, username)

      if (existingGithubIds.has(String(githubUser.id))) {
        skippedStudents.push({
          username: githubUser.login,
          reason: "duplicate",
          message: "Student GitHub ID is already in students.csv",
        })

        processed++
        continue
      }

      const nameParts = splitGitHubDisplayName(githubUser.name)

      const studentEmail = githubUser.email ?? ""

      const student = normalizeStudentRow({
        username: githubUser.login,
        first_name: nameParts.first_name,
        last_name: nameParts.last_name,
        email: studentEmail,
        section: "",
        github_id: String(githubUser.id),
        // Still onboards to supply name/email; reconcile flips to "enrolled".
        // Cache email_hash when GitHub exposes a public email so reconcile can
        // match the self-report by email if needed.
        enrollment_status: "invited",
        enrollment_method: "github",
        email_hash: studentEmail ? await emailHash(studentEmail) : "",
        // Unique per-student invite token so a secure onboarding link always
        // exists (reconcile's strongest match key when used; otherwise it falls
        // back to github_id / email).
        invite_token: generateInviteToken(),
        invited_at: new Date().toISOString(),
      })

      existingUsernameKeys.add(student.username.toLowerCase())
      existingGithubIds.add(student.github_id)
      addedStudents.push(student)
    } catch (err) {
      skippedStudents.push({
        username,
        reason: "not_found",
        message:
          err instanceof Error ? err.message : "Could not fetch GitHub user",
      })
    }

    processed++

    input.onProgress?.({
      processed,
      total: normalizedUsernames.length,
      message: `Checked ${processed} of ${normalizedUsernames.length} usernames...`,
    })
  }

  if (addedStudents.length === 0) {
    throw new Error("No new students to add")
  }

  input.onProgress?.({
    processed,
    total: normalizedUsernames.length,
    message: "Writing students.csv...",
  })

  const nextStudents = [...currentStudents, ...addedStudents]
  const nextCsv = stringifyStudentsCsv(nextStudents)

  const tree = await createGitTree(client, {
    org: input.org,
    base_tree: commit.tree.sha,
    tree: [
      {
        path: studentsFilePath,
        mode: "100644",
        type: "blob",
        content: nextCsv,
      },
    ],
  })

  const newCommit = await createGitCommit(client, {
    org: input.org,
    message: `Add ${addedStudents.length} student ${
      addedStudents.length === 1 ? "" : "s"
    }: ${input.classroom}`,
    tree_sha: tree.sha,
    parents: [ref.object.sha],
  })

  const updatedRef = await updateRef(client, input.org, newCommit.sha)

  input.onProgress?.({
    processed: normalizedUsernames.length,
    total: normalizedUsernames.length,
    message: "students.csv updated.",
  })

  return {
    previousCommitSha: ref.object.sha,
    baseTreeSha: commit.tree.sha,
    newTreeSha: tree.sha,
    newCommitSha: newCommit.sha,
    updatedRef,
    addedStudents,
    skippedStudents,
  }
}

export async function addStudentsToClassroomWithConflictRetry(
  client: GitHubClient,
  input: AddStudentsToClassroomInput,
) {
  return withGitConflictRetry(() => addStudentsToClassroom(client, input))
}

export type BulkEnrollStudentsResult = AddStudentsToClassroomResult & {
  teamResults: {
    username: string
    status: "added" | "failed"
    message?: string
  }[]
}

export type BulkImportResult = {
  addedStudents: StudentCsvRow[]
  skippedStudents: {
    username: string
    reason: "duplicate" | "not_found" | "invalid" | "error"
    message?: string
  }[]
  teamResults?: {
    username: string
    status: "added" | "failed"
    message?: string
  }[]
}
export async function bulkEnrollStudentsInClassroom(
  client: GitHubClient,
  input: AddStudentsToClassroomInput,
): Promise<BulkEnrollStudentsResult> {
  const { onProgress, ...bulkInput } = input

  const total = bulkInput.usernames.length

  onProgress?.({
    processed: 0,
    total,
    message: "Reading classroom roster...",
  })

  // Retry on conflict: a concurrent commit during the slow bulk window would
  // 409 the roster commit and discard the whole import. Re-reading is safe —
  // adds are append-only.
  const addResult = await addStudentsToClassroomWithConflictRetry(client, {
    ...bulkInput,
    onProgress,
  })

  // The roster commit already landed. A transient slug-read failure becomes a
  // per-student team failure (the result still reports the committed adds)
  // rather than rejecting the whole bulk enroll.
  let teamSlug: string | undefined
  let teamSlugError: string | undefined
  try {
    teamSlug = await resolveClassroomTeamSlug(
      client,
      bulkInput.org,
      bulkInput.classroom,
    )
  } catch (err) {
    teamSlugError = getErrorMessage(err)
  }

  const teamResults: BulkImportResult["teamResults"] = []

  for (let i = 0; i < addResult.addedStudents.length; i++) {
    const student = addResult.addedStudents[i]

    onProgress?.({
      processed: i,
      total: addResult.addedStudents.length,
      message: `Adding ${student.username} to classroom team...`,
    })

    if (teamSlug === undefined) {
      teamResults.push({
        username: student.username,
        status: "failed",
        message:
          `Could not read the classroom team to add the student` +
          (teamSlugError ? ` (${teamSlugError})` : "") +
          "; retry to add them to the team.",
      })

      onProgress?.({
        processed: i + 1,
        total: addResult.addedStudents.length,
        message: `Processed ${i + 1} of ${addResult.addedStudents.length} team memberships...`,
      })
      continue
    }

    try {
      await addUserToTeam(client, {
        org: bulkInput.org,
        teamSlug,
        username: student.username,
        role: "member",
      })

      teamResults.push({
        username: student.username,
        status: "added",
      })
    } catch (err) {
      teamResults.push({
        username: student.username,
        status: "failed",
        message:
          err instanceof Error
            ? err.message
            : "Could not add user to classroom team",
      })
    }

    onProgress?.({
      processed: i + 1,
      total: addResult.addedStudents.length,
      message: `Processed ${i + 1} of ${addResult.addedStudents.length} team memberships...`,
    })
  }

  onProgress?.({
    processed: total,
    total,
    message: "Import complete",
  })

  return {
    ...addResult,
    teamResults,
  }
}

export type UnenrollStudentInput = {
  org: string
  classroom: string
  student: Student
  // Teacher's choice for an ACTIVE member: also remove them from the org.
  // Ignored for pending invitees (always cancelled) and non-members. Defaults
  // off so a student switching classes keeps their org seat.
  removeFromOrg?: boolean
}
export async function unenrollStudent(
  client: GitHubClient,
  input: UnenrollStudentInput,
) {
  const { org, classroom, student: toRemoveStudent, removeFromOrg } = input
  const normalizedUsername = toRemoveStudent?.username.trim()
  const normalizedEmail = toRemoveStudent?.email?.trim()

  // A mid-onboarding email row has no username yet, so accept an email as the
  // identifier too. One of the two must be present to target a row.
  if (!normalizedUsername && !normalizedEmail) {
    throw new Error("Student's GitHub username or email is required")
  }

  // Resolve the slug concurrently with the removal commit. It can reject on a
  // transient read; attach a catch and consume it in the warning path below.
  const teamSlugPromise = resolveClassroomTeamSlug(client, org, classroom)
  teamSlugPromise.catch(() => {})

  // Read org state and viewer before the commit. State is null on read failure
  // (we then skip the org action). The viewer guards against removing the
  // signed-in teacher from their own org. An email-only row has no username to
  // resolve org state for, so skip that read.
  const orgStatePromise = normalizedUsername
    ? getOrgMembershipState(client, org, normalizedUsername)
    : Promise.resolve(null)
  orgStatePromise.catch(() => {})
  const viewerPromise = getAuthenticatedUser(client)
  viewerPromise.catch(() => {})

  const ref = await getBranchRef(client, org)
  const commit = await getCommit(client, org, ref.object.sha)

  const studentsFilePath = `${classroom}/students.csv`

  const currentCsv = await getRawFile(client, {
    org,
    path: studentsFilePath,
    ref: ref.object.sha,
  })

  const currentStudents = parseStudentsCsv(currentCsv)

  // Match the target row. Prefer username/github_id; fall back to email for a
  // not-yet-reconciled email row that has neither.
  const sameRow = (student: StudentCsvRow) => {
    if (normalizedUsername || toRemoveStudent.github_id) {
      return (
        student.username.toLowerCase() ===
          toRemoveStudent.username.toLowerCase() ||
        (Boolean(student.github_id) &&
          student.github_id === String(toRemoveStudent.github_id))
      )
    }
    return (
      Boolean(normalizedEmail) &&
      student.email.toLowerCase() === normalizedEmail!.toLowerCase()
    )
  }

  const exists = currentStudents.some(sameRow)

  if (!exists) {
    throw new Error(
      `Student ${toRemoveStudent.username || normalizedEmail} does not exist in roster!`,
    )
  }

  const nextStudents = currentStudents.filter((student) => !sameRow(student))
  const nextCsv = stringifyStudentsCsv(nextStudents)

  const tree = await createGitTree(client, {
    org,
    base_tree: commit.tree.sha,
    tree: [
      {
        path: studentsFilePath,
        mode: "100644",
        type: "blob",
        content: nextCsv,
      },
    ],
  })

  const newCommit = await createGitCommit(client, {
    org,
    message: `Remove student: ${classroom}/${toRemoveStudent.username || normalizedEmail}`,
    tree_sha: tree.sha,
    parents: [ref.object.sha],
  })

  const updatedRef = await updateRef(client, org, newCommit.sha)

  // Commit landed, so every org-side step below is a non-fatal warning.
  const warnings: string[] = []

  // Reset onboarding for a not-yet-reconciled student: delete their onboarding
  // repo(s) so a re-invite starts clean. The repo name is
  // `classroom50-onboarding-<github-id>-<random-hash>`, so when we know the
  // student's github_id we list the org's onboarding repos and delete the ones
  // under that github-id prefix (the random suffix isn't derivable). An
  // email-only row with no github_id yet has no targetable name; its repo (if
  // any) is harmless and gets cleaned at the next reconcile. Best-effort and
  // idempotent (404 = already gone); a failed delete falls back to archive.
  if (
    toRemoveStudent.enrollment_status !== "enrolled" &&
    toRemoveStudent.github_id
  ) {
    const prefix = onboardingRepoPrefixForGithubId(toRemoveStudent.github_id)
    let onboardingRepos: string[] = []
    try {
      onboardingRepos = (await listOnboardingRepos(client, org))
        .map((repo) => repo.name)
        .filter((name) => name.startsWith(prefix))
    } catch {
      // Best-effort reset: if listing fails, skip repo cleanup.
    }
    for (const onboardingRepo of onboardingRepos) {
      try {
        await deleteRepo(client, { owner: org, repo: onboardingRepo })
      } catch (err) {
        if (err instanceof GitHubAPIError && err.isForbidden) {
          // No delete permission (older session): archive instead so the repo
          // is no longer a live onboarding target.
          try {
            await archiveRepo(client, { owner: org, repo: onboardingRepo })
          } catch {
            // ignore — best-effort reset
          }
        }
        // Other errors (incl. 404 handled inside deleteRepo) are non-fatal.
      }
    }
  }

  // Drop from the classroom team. Idempotent (404 = not a member / team gone);
  // org membership untouched by this call. Skipped for an email-only row (no
  // username to target, and they may not be in the org/team yet).
  if (normalizedUsername) {
    try {
      const teamSlug = await teamSlugPromise
      await removeUserFromTeam(client, {
        org,
        teamSlug,
        username: normalizedUsername,
      })
    } catch (err) {
      console.error("team removal failed (student unenrolled):", err)
      const detail = getErrorMessage(err)
      warnings.push(
        `${toRemoveStudent.username} was removed from the roster, but removing ` +
          `them from the classroom team failed (${detail}); they may keep read on ` +
          `private templates until it's retried.`,
      )
    }
  }

  // pending invite -> always cancel; active member -> remove only if opted in;
  // neither -> nothing. DELETE /orgs/{org}/memberships/{username} does both.
  const orgState = await orgStatePromise

  // Never remove the signed-in teacher from their own org (GitHub would remove a
  // non-sole owner, or 403 on the last owner).
  const viewer = await viewerPromise.catch(() => null)
  const isSelf = isSameGitHubUser(viewer, toRemoveStudent)

  const shouldRemoveFromOrg =
    orgState === "pending" || (orgState === "active" && removeFromOrg === true)

  if (shouldRemoveFromOrg && isSelf) {
    warnings.push(
      `${toRemoveStudent.username} was removed from the roster. Their ` +
        `organization membership was kept because they are the signed-in ` +
        `account. Remove yourself from the organization's people page if you ` +
        `really intend to.`,
    )
  } else if (shouldRemoveFromOrg) {
    try {
      await removeOrgMembership(client, { org, username: normalizedUsername })
    } catch (err) {
      console.error("org membership removal failed (student unenrolled):", err)
      const detail = getErrorMessage(err)
      const what =
        orgState === "pending"
          ? "cancelling their pending org invite"
          : "removing them from the organization"
      warnings.push(
        `${toRemoveStudent.username} was removed from the roster, but ${what} ` +
          `failed (${detail}); retry from the organization's people page.`,
      )
    }
  }

  return {
    previousCommitSha: ref.object.sha,
    baseTreeSha: commit.tree.sha,
    newTreeSha: tree.sha,
    newCommitSha: newCommit.sha,
    updatedRef,
    teamWarning: warnings.length > 0 ? warnings.join(" ") : undefined,
  }
}
