// Naming for the onboarding flow. A student self-reports their identity by
// creating an onboarding repo from inside an authenticated session. The repo
// name is `classroom50-onboarding-<github-id>-<random-hash>`: the github-id
// segment ties it to the creator, and the browser-generated random suffix makes
// the name unguessable (so no other org member can pre-create — "squat" — a
// victim's onboarding repo) and unique per onboarding (so a student enrolled in
// multiple classrooms of one org gets a distinct repo each time; no collision).
//
// Because the random suffix is not derivable by the teacher, the name is NOT a
// lookup key: reconcile lists onboarding repos by the shared prefix and matches
// each self-report back to a roster row purely on the YAML payload contents
// (invite_token, then github_id, then email). The authoritative identity lives
// inside .classroom50-onboarding.yaml (GitHub-attested username/id; claimed
// email; optional teacher-issued invite_token).

export const ONBOARDING_REPO_PREFIX = "classroom50-onboarding-"

// Path of the self-report payload committed into the onboarding repo.
export const ONBOARDING_YAML_PATH = ".classroom50-onboarding.yaml"

// Lowercase hex of a byte array. Shared by the invite-token generator and the
// email hasher so the Uint8Array -> hex transform lives in one place.
function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
}

// 16 bytes (128 bits) of cryptographic randomness as 32-char lowercase hex.
// Backs both the per-student invite token and the onboarding repo suffix:
// both need an unguessable, collision-proof identifier from the same source.
function random128BitHex(): string {
  const bytes = new Uint8Array(16)
  crypto.getRandomValues(bytes)
  return bytesToHex(bytes)
}

// Optional per-student invite token. When a teacher sends a student a unique
// secure onboarding link, we generate this random token and store it on the
// roster row + the link. Unlike the classroom-wide link, the token is NOT
// derivable from public info — at onboarding time it is written into the
// self-report YAML (NOT the repo name), where reconcile uses it as the
// strongest match key, binding the self-report to the exact roster row the
// teacher issued it for. This closes the email-row hijack for students who use
// the secure link; the classroom-wide link omits it and falls back to
// github_id / email matching.
export function generateInviteToken(): string {
  return random128BitHex()
}

// Token names are validated before they ever flow into a YAML field or a URL,
// so a hand-edited/garbage value can't propagate downstream.
const INVITE_TOKEN_PATTERN = /^[0-9a-f]{32}$/

export function isValidInviteToken(token: string): boolean {
  return INVITE_TOKEN_PATTERN.test(token.trim())
}

// Browser-generated random suffix for an onboarding repo name. 16 bytes (128
// bits) of hex: collision-proof in practice and unguessable, so the resulting
// repo name can't be pre-squatted by another org member. Generated fresh per
// onboarding attempt; written nowhere else (the name itself is the only record).
export function generateOnboardingSuffix(): string {
  return random128BitHex()
}

// The onboarding repo name: prefix + github-id + random suffix. The github-id
// segment is the stable, self-attested part (used to scope the reconcile prefix
// list); the random suffix makes the full name unguessable and unique. Callers
// that look the repo up later must list by `onboardingRepoPrefixForGithubId`
// (the exact name is not recomputable without the suffix).
export function onboardingRepoName(
  githubId: number | string,
  randomSuffix: string,
): string {
  return `${ONBOARDING_REPO_PREFIX}${githubId}-${randomSuffix}`
}

// Prefix matching every onboarding repo a given github-id could have created
// (`classroom50-onboarding-<id>-`). Used to find a student's own repo(s) when
// the random suffix isn't known (revisit detection, unenroll cleanup).
export function onboardingRepoPrefixForGithubId(
  githubId: number | string,
): string {
  return `${ONBOARDING_REPO_PREFIX}${githubId}-`
}

// Canonical form for hashing/comparison so the same human inbox maps to one
// key. Lowercase + trim only: we deliberately do NOT strip Gmail-style `+tags`
// or dots, because those transforms are provider-specific and would collapse
// genuinely distinct addresses (rongxinliu.g@ vs rongxinliu-g@) onto one key.
// The teacher's invited email and the student's self-reported email are both
// normalized this way, so reconcile's email match compares like for like.
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase()
}

// Minimal email shape check — a single `@` with non-empty local and domain
// parts and a dotted domain. Deliberately permissive (GitHub, not us, is the
// real validator at invite time); this only catches obvious typos before we
// commit a row and fire an invite.
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function isValidEmail(email: string): boolean {
  return EMAIL_PATTERN.test(email.trim())
}

// Lower-cased hex SHA-256 of the normalized email, truncated to 16 chars
// (64 bits). Cached on the roster row as `email_hash` so the teacher reconcile
// can match an email-first self-report to its row without storing the raw
// email twice. Collision risk is negligible for a classroom. Async because Web
// Crypto's subtle.digest returns a Promise.
export async function emailHash(email: string): Promise<string> {
  const data = new TextEncoder().encode(normalizeEmail(email))
  const digest = await crypto.subtle.digest("SHA-256", data)
  return bytesToHex(new Uint8Array(digest)).slice(0, 16)
}

// A roster row is reconcilable when it isn't already enrolled and carries a
// key to look its onboarding self-report up by (a github_id or an email to
// match the YAML payload against). Shared by the UI's pending-count badge so it
// can't drift from what reconcile will actually resolve.
export function isReconcilableRow(row: {
  enrollment_status?: string
  github_id?: string
  email_hash?: string
}): boolean {
  return (
    row.enrollment_status !== "enrolled" &&
    Boolean(row.email_hash || row.github_id)
  )
}

// Whether a self-report payload's claimed email matches the email the roster
// row was invited under. The onboarding repo name is unguessable, but a student
// could still self-report a DIFFERENT person's email in the YAML; binding the
// payload email back to the invited row's email_hash (or email) stops a
// self-report for the wrong person from being folded into someone else's row.
// This is the last-resort match key (after invite_token and github_id); for a
// github_id-keyed row with no email on file it falls through to true and the
// caller relies on the commit-author identity check.
export async function payloadEmailMatchesRow(
  payloadEmail: string,
  row: { email?: string; email_hash?: string },
): Promise<boolean> {
  const normalized = normalizeEmail(payloadEmail)
  if (row.email_hash) {
    return (await emailHash(normalized)) === row.email_hash
  }
  if (row.email?.trim()) {
    return normalized === normalizeEmail(row.email)
  }
  // A github_id-keyed row with no email on file can't be email-checked here;
  // the caller falls back to the commit-author identity check for those.
  return true
}

// Self-report payload committed to ONBOARDING_YAML_PATH inside the onboarding
// repo. github_username/github_id come from the authenticated session (GitHub-
// attested, unforgeable); email and name are student-supplied (claimed).
// invite_token is present only when the student onboarded via a teacher-issued
// secure link; it's the strongest reconcile match key when set.
export type OnboardingPayload = {
  email: string
  first_name: string
  last_name: string
  github_username: string
  github_id: number
  classroom: string
  created_at: string
  invite_token?: string
}
