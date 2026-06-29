import type { GitHubClient } from "@/hooks/github/client"
import { createOrgInvitation, getErrorMessage } from "@/hooks/github/mutations"
import { getUserById } from "@/hooks/github/queries"
import type { OrgMemberRow } from "@/util/orgMembers"

export type InviteToOrgResult = {
  // The current GitHub login resolved from the immutable id (may differ from the
  // CSV username if the student renamed their account); undefined if the lookup
  // failed (the invite is sent by id regardless).
  currentUsername?: string
  invited: boolean
}

// Invite a roster student who is not (yet) an org member back into the org (#76).
// The invite is sent by invitee_id (the immutable github_id), NOT by username:
// the CSV username can be stale if the student renamed their GitHub account, and
// GitHub's invitation API accepts the numeric id directly. We additionally
// resolve the current login by id (best-effort) so the confirmation can name the
// account accurately.
export async function inviteMemberToOrg(
  client: GitHubClient,
  input: { org: string; row: OrgMemberRow },
): Promise<InviteToOrgResult> {
  const { org, row } = input
  const inviteeId = Number(row.github_id)
  if (!Number.isFinite(inviteeId) || inviteeId <= 0) {
    throw new Error(
      `Can't invite ${row.username || row.email}: no GitHub id on file.`,
    )
  }

  // Best-effort current-login lookup; never blocks the invite.
  let currentUsername: string | undefined
  try {
    currentUsername = (await getUserById(client, inviteeId)).login
  } catch {
    currentUsername = undefined
  }

  try {
    await createOrgInvitation(client, { org, invitee_id: inviteeId })
  } catch (err) {
    throw new Error(getErrorMessage(err), { cause: err })
  }

  return { currentUsername, invited: true }
}
