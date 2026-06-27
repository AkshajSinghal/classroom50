import type { GitHubClient } from "@/hooks/github/client"
import { GitHubAPIError } from "@/hooks/github/errors"
import {
  addRepoCollaborator,
  archiveRepo,
  createCommitRepo,
  createTreeRepo,
  deleteRepo,
  updateRefForRepo,
} from "@/hooks/github/mutations"
import {
  resolveOwnOnboardingRepo,
  getBranchRefRepo,
  getCommitByRepo,
  withFreshRepoRetry,
} from "@/hooks/github/queries"
import type { GitHubRepo } from "@/hooks/github/types"
import { getAuthenticatedUser } from "@/api/queries/users"
import { acceptPendingOrgInvite } from "@/api/mutations/users"
import {
  ONBOARDING_YAML_PATH,
  generateOnboardingSuffix,
  onboardingRepoName,
  isValidInviteToken,
  type OnboardingPayload,
} from "@/util/onboarding"
import { stringifyOnboardingYaml } from "@/util/yaml"

export type OnboardingResult = {
  status: "created" | "already-onboarded"
  // The created or reused onboarding repo. Always present (every path either
  // creates the repo or re-fetches an existing one before returning).
  repo: GitHubRepo
  repoName: string
  payload: OnboardingPayload
}

// Create the student's onboarding repo in the org and commit the self-report
// payload. The student is authenticated, so username/id come from GitHub
// (unforgeable). The repo name carries a browser-random suffix (not derivable
// by the teacher), so it isn't a lookup key — reconcile finds it by prefix and
// matches on the YAML. Idempotent: a re-submit reuses the student's existing
// repo and re-commits the payload ("already-onboarded") rather than minting a
// duplicate.
export async function submitOnboarding(
  client: GitHubClient,
  input: {
    org: string
    classroom: string
    email: string
    first_name: string
    last_name: string
    // Present only on the secure-link flow: the teacher-issued token. It is
    // written into the self-report YAML (it does NOT name the repo) and is
    // reconcile's strongest match key. Absent on the classroom-wide link.
    invite_token?: string
  },
): Promise<OnboardingResult> {
  const { org, classroom, email, first_name, last_name } = input
  const inviteToken =
    input.invite_token && isValidInviteToken(input.invite_token)
      ? input.invite_token.trim()
      : undefined

  const user = await getAuthenticatedUser(client)

  // The membership gate accepts both "pending" and "active" invites, so a
  // student who hasn't accepted yet can reach here — and a pending invitee is
  // NOT a member, so the repo create below 403s ("need admin access to add a
  // repository"). Activate the invite with the student's own token first so
  // they're a real member before creating their onboarding repo. Best-effort:
  // if they're already active this is a no-op, and any genuine problem surfaces
  // on the repo create with a clearer message.
  await acceptPendingOrgInvite(client, org)

  // Orphan guard: reuse the student's existing onboarding repo for THIS
  // classroom instead of minting a duplicate on a re-submit / stale tab /
  // double-click. resolveOwnOnboardingRepo distinguishes a classroom-matched
  // repo, a single in-progress repo whose YAML hasn't landed yet (reuse it so
  // the first attempt isn't stranded as an orphan), and "none". It THROWS on a
  // transient list failure rather than reporting "none", so a blip can't make
  // us fork a second repo for a student who already has one — that error
  // propagates as a retryable failure. We don't use classroom-team membership
  // as the signal: the username-invite flow adds the student to the team at
  // INVITE time, so they're an active team member before they onboard.
  const existing = await resolveOwnOnboardingRepo(
    client,
    org,
    user.id,
    classroom,
  )
  const existingRepoName =
    existing.status === "none" ? undefined : existing.repo

  const payload: OnboardingPayload = {
    email: email.trim(),
    first_name: first_name.trim(),
    last_name: last_name.trim(),
    github_username: user.login,
    github_id: user.id,
    classroom,
    created_at: new Date().toISOString(),
    // Carried only when the student used a teacher-issued secure link; it's the
    // strongest reconcile match key. Absent on the classroom-wide link.
    ...(inviteToken ? { invite_token: inviteToken } : {}),
  }

  // The repo name is `classroom50-onboarding-<github-id>-<random-hash>`. The
  // browser-generated random suffix makes the name unguessable (no other org
  // member can pre-create — "squat" — this student's repo) and unique per
  // onboarding (a student in multiple classrooms of one org gets a distinct
  // repo each time). The name is NOT a teacher-side lookup key: reconcile lists
  // by prefix and matches on the YAML payload contents. On a re-submit we reuse
  // the student's existing repo (found above) so we never leave an orphan.
  const reusingExisting = existingRepoName !== undefined
  const repoName =
    existingRepoName ?? onboardingRepoName(user.id, generateOnboardingSuffix())

  let repo: GitHubRepo
  let status: OnboardingResult["status"] = reusingExisting
    ? "already-onboarded"
    : "created"
  // True only when THIS call created the repo (so a commit failure means the
  // repo is a brand-new empty orphan we should clean up). A reused/pre-existing
  // repo is left in place on failure — it may already hold a valid payload.
  let createdThisCall = false

  try {
    repo = await client.request<GitHubRepo>(`/orgs/${org}/repos`, {
      method: "POST",
      body: {
        name: repoName,
        private: true,
        auto_init: true,
        description: `Classroom50 onboarding for ${classroom}`,
      },
    })
    createdThisCall = true
  } catch (err) {
    // 422 = repo already exists (a prior attempt, or a reused repo). Re-fetch
    // and re-commit the payload so a half-finished attempt still self-heals.
    if (err instanceof GitHubAPIError && err.status === 422) {
      repo = await client.request<GitHubRepo>(`/repos/${org}/${repoName}`)
      status = "already-onboarded"
    } else if (err instanceof GitHubAPIError && err.isForbidden) {
      // Reached here despite the accept attempt above: either the org invite
      // couldn't be activated, or the org restricts member repo creation (an
      // owner-only setting). Replace GitHub's opaque "need admin access" text
      // with something the student/instructor can act on.
      throw new Error(
        `Couldn't create your onboarding repository in ${org}. Make sure you have ` +
          `accepted the ${org} organization invitation (check your email), then ` +
          `try again. If this keeps happening, your instructor may need to allow ` +
          `members to create repositories in the organization settings.`,
        { cause: err },
      )
    } else {
      throw err
    }
  }

  const branch = repo.default_branch || "main"
  const payloadYaml = stringifyOnboardingYaml(payload)

  // Commit the payload, riding out GitHub's post-create git-data lag (a fresh
  // auto_init repo's git APIs 404/409 transiently). No concurrent writers. If
  // the commit ultimately fails AND we created the repo this call, clean it up
  // so a permanent failure can't leave an empty orphan repo behind (each failed
  // retry-with-fresh-suffix would otherwise accumulate one).
  try {
    await withFreshRepoRetry(async () => {
      const ref = await getBranchRefRepo(client, org, repoName, branch)
      const parentSha = ref.object.sha
      const currentCommit = await getCommitByRepo(
        client,
        org,
        repoName,
        parentSha,
      )
      const baseTreeSha = currentCommit.tree?.sha

      if (!parentSha || !baseTreeSha) {
        // Match the message isFreshRepoLagError keys on so withFreshRepoRetry
        // retries instead of surfacing a hard failure.
        throw new GitHubAPIError({
          status: 409,
          url: `/repos/${org}/${repoName}/git/commits`,
          message: "Git Repository is empty.",
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

      const tree = await createTreeRepo(client, {
        org,
        repo: repoName,
        base_tree: baseTreeSha,
        tree: [
          {
            path: ONBOARDING_YAML_PATH,
            mode: "100644",
            type: "blob",
            content: payloadYaml,
          },
        ],
      })

      const commit = await createCommitRepo(client, {
        org,
        repo: repoName,
        parents: [parentSha],
        tree: tree.sha,
        message: "Classroom50 onboarding self-report",
      })

      await updateRefForRepo({
        client,
        owner: org,
        repo: repoName,
        branch,
        commitSha: commit.sha,
      })
    })
  } catch (err) {
    if (createdThisCall) {
      // Best-effort cleanup of the empty repo we just created; fall back to
      // archive if delete isn't permitted. Either way, re-throw so the caller
      // surfaces a retryable failure rather than a half-created success.
      try {
        await deleteRepo(client, { owner: org, repo: repoName })
      } catch {
        try {
          await archiveRepo(client, { owner: org, repo: repoName })
        } catch {
          // Nothing more we can do; the orphan guard will reuse it next time.
        }
      }
    }
    throw err
  }

  // Now that the self-report is committed, drop our own access to read-only.
  // The student created the repo (so they're its admin); demoting to "pull"
  // keeps the repo essentially hidden/uneditable for them while leaving the org
  // owner full admin (org repos are owned by the org) and not affecting teacher
  // reconciliation (which reads via the org). Best-effort and ordered strictly
  // AFTER the commit so a failure here can never strand a half-written repo;
  // it's non-fatal because the onboarding payload has already landed.
  try {
    await addRepoCollaborator({
      client,
      org,
      repo: repoName,
      username: user.login,
      permission: "pull",
    })
  } catch {
    // Non-fatal: the payload is committed and reconcilable regardless.
  }

  return { status, repo, repoName, payload }
}
