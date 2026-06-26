import Papa from "papaparse"
import type { GitHubClient } from "@/hooks/github/client"
import {
  addUserToTeam,
  createGitCommit,
  createGitTree,
  createOrgInvitation,
  ensureOrgMembership,
  getErrorMessage,
  getOrgMembershipState,
  removeOrgMembership,
  removeUserFromTeam,
  updateRef,
} from "@/hooks/github/mutations"
import { withGitConflictRetry, type CreateClassroomResult } from "./classrooms"
import { getRawFile, getRepoFile, getUser } from "@/hooks/github/queries"
import { getAuthenticatedUser } from "@/api/queries/users"
import { getBranchRef, getClassroomJson, getCommit } from "../github/queries"
import { GitHubAPIError } from "@/hooks/github/errors"
import { isSameGitHubUser } from "@/util/students"
import {
  emailHash,
  onboardingRepoNameFromHash,
  ONBOARDING_YAML_PATH,
} from "@/util/onboarding"
import { parseOnboardingYaml } from "@/util/yaml"
import type { Student } from "@/types/classroom"

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
  try {
    const classroomJson = await getClassroomJson(client, { org, classroom })
    if (classroomJson.team?.slug) {
      return classroomJson.team.slug
    }
  } catch (err) {
    // 404 = no classroom.json (pre-feature) is a genuine "no team"; fall
    // through. Anything else is transient and must not be misread as "no team".
    if (!(err instanceof GitHubAPIError && err.isNotFound)) {
      throw err
    }
  }
  return `classroom50-${classroom}`
}

export type AddStudentToClassroomResult = CreateClassroomResult & {
  student: StudentCsvRow
  // Set when the student was added to the roster (committed) but the
  // follow-up team add failed — a non-fatal warning (no private-template read
  // until retried). Mirrors the bulk path's teamResults / teamDeleteWarning.
  teamWarning?: string
}

const STUDENT_CSV_FIELDS = [
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
  "email_hash",
  "invited_at",
  "reconciled_at",
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
    email_hash: String(row.email_hash ?? "").trim(),
    invited_at: String(row.invited_at ?? "").trim(),
    reconciled_at: String(row.reconciled_at ?? "").trim(),
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

  const student: StudentCsvRow = normalizeStudentRow({
    username: githubUser.login,
    first_name: input.first_name?.trim() ?? nameParts.first_name,
    last_name: input.last_name?.trim() ?? nameParts.last_name,
    email: input.email?.trim() ?? githubUser.email ?? "",
    section: input.section?.trim() ?? "",
    github_id: String(githubUser.id),
    // A username-add already has a resolved GitHub identity, so it bypasses the
    // email-first onboarding lifecycle entirely.
    enrollment_status: "reconciled",
    reconciled_at: new Date().toISOString(),
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
    email_hash: await emailHash(normalizedEmail),
    invited_at: new Date().toISOString(),
    reconciled_at: "",
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

  try {
    await createOrgInvitation(client, {
      org: input.org,
      email: result.student.email,
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
  // email_hash rows still without an onboarding repo (student hasn't onboarded).
  pending: string[]
  // Onboarding repos found but whose payload couldn't be matched/parsed.
  unmatched: { repo: string; reason: string }[]
}

// Teacher-side reconciliation: for each not-yet-reconciled email row, fetch its
// deterministic onboarding repo directly (no org scan), read the self-report
// YAML, and fold the GitHub-attested username/id into the roster. All updates
// land in ONE students.csv commit (wrapped in withGitConflictRetry) so a batch
// reconcile is a single race window, not N.
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
  }

  // Read the roster once (outside the retry) to decide which repos to fetch.
  const headRef = await getBranchRef(client, org)
  const roster = parseStudentsCsv(
    await getRawFile(client, {
      org,
      path: studentsFilePath,
      ref: headRef.object.sha,
    }),
  )

  const targets = roster.filter(
    (row) => row.enrollment_status !== "reconciled" && row.email_hash,
  )

  if (targets.length === 0) {
    return result
  }

  // email_hash -> resolved identity, for the single batched write below.
  const resolved = new Map<string, { username: string; github_id: string }>()

  for (const row of targets) {
    const repo = onboardingRepoNameFromHash(row.email_hash)
    let payload
    try {
      payload = parseOnboardingYaml(
        await getRepoFile(client, org, repo, ONBOARDING_YAML_PATH),
      )
    } catch (err) {
      // 404 = student hasn't onboarded yet (not an error). Anything else is an
      // onboarding repo we found but couldn't read/parse — surface it.
      if (err instanceof GitHubAPIError && err.isNotFound) {
        result.pending.push(row.email)
      } else {
        result.unmatched.push({ repo, reason: getErrorMessage(err) })
      }
      continue
    }

    resolved.set(row.email_hash, {
      username: payload.github_username,
      github_id: String(payload.github_id),
    })
    result.reconciled.push({
      email: row.email,
      username: payload.github_username,
    })
  }

  if (resolved.size === 0) {
    return result
  }

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

    const now = new Date().toISOString()
    const next = current.map((row) => {
      const match = row.email_hash ? resolved.get(row.email_hash) : undefined
      if (!match || row.enrollment_status === "reconciled") {
        return row
      }
      return normalizeStudentRow({
        ...row,
        username: match.username,
        github_id: match.github_id,
        enrollment_status: "reconciled",
        reconciled_at: now,
      })
    })

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
      message: `Reconcile onboarding: ${classroom} (${resolved.size} student${
        resolved.size === 1 ? "" : "s"
      })`,
      tree_sha: tree.sha,
      parents: [ref.object.sha],
    })

    await updateRef(client, org, newCommit.sha)
  })

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
  // Resolve the slug concurrently with the roster commit. It can reject on a
  // transient read; attach a catch to avoid an unhandled rejection and consume
  // it (rethrowing into the warning path) after the commit lands.
  const teamSlugPromise = resolveClassroomTeamSlug(client, org, classroom)
  teamSlugPromise.catch(() => {})
  const result = await addStudentToClassroomWithConflictRetry(client, input)

  // CLI order: roster row -> membership -> team. Membership/team failures are
  // non-fatal warnings since the commit already landed.
  const warnings: string[] = []

  // Ensure org membership via the numeric github_id resolved during the roster
  // write. ensureOrgMembership prechecks and swallows the benign already-member/
  // already-pending 422.
  const inviteeId = Number(result.student.github_id)
  if (Number.isFinite(inviteeId) && inviteeId > 0) {
    try {
      await ensureOrgMembership(client, {
        org,
        username: result.student.username,
        inviteeId,
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

  try {
    const teamSlug = await teamSlugPromise
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

      const student = normalizeStudentRow({
        username: githubUser.login,
        first_name: nameParts.first_name,
        last_name: nameParts.last_name,
        email: githubUser.email ?? "",
        section: "",
        github_id: String(githubUser.id),
        // Resolved GitHub identity at add time -> bypasses email-first onboarding.
        enrollment_status: "reconciled",
        reconciled_at: new Date().toISOString(),
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

  if (!normalizedUsername) {
    throw new Error("Student's GitHub username is required")
  }

  // Resolve the slug concurrently with the removal commit. It can reject on a
  // transient read; attach a catch and consume it in the warning path below.
  const teamSlugPromise = resolveClassroomTeamSlug(client, org, classroom)
  teamSlugPromise.catch(() => {})

  // Read org state and viewer before the commit. State is null on read failure
  // (we then skip the org action). The viewer guards against removing the
  // signed-in teacher from their own org.
  const orgStatePromise = getOrgMembershipState(client, org, normalizedUsername)
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

  const exists = currentStudents.some(
    (student) =>
      student.username.toLowerCase() ===
        toRemoveStudent.username.toLowerCase() ||
      student.github_id === String(toRemoveStudent.github_id),
  )

  if (!exists) {
    throw new Error(
      `Student ${toRemoveStudent.username} does not exist in roster!`,
    )
  }

  const nextStudents = [
    ...currentStudents.filter(
      (student) =>
        student.username !== toRemoveStudent.username &&
        student.github_id !== toRemoveStudent.github_id,
    ),
  ]
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
    message: `Remove student: ${classroom}/${toRemoveStudent.username}`,
    tree_sha: tree.sha,
    parents: [ref.object.sha],
  })

  const updatedRef = await updateRef(client, org, newCommit.sha)

  // Commit landed, so every org-side step below is a non-fatal warning.
  const warnings: string[] = []

  // Drop from the classroom team. Idempotent (404 = not a member / team gone);
  // org membership untouched by this call.
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
