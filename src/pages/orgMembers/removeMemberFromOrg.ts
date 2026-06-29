import type { GitHubClient } from "@/hooks/github/client"
import { unenrollStudent } from "@/api/mutations/students"
import { removeOrgMembership, getErrorMessage } from "@/hooks/github/mutations"
import type { Student } from "@/types/classroom"
import type { OrgMemberRow } from "@/util/orgMembers"

export type RemoveFromOrgResult = {
  // Classrooms the student was unenrolled from before org removal.
  unenrolledClassrooms: string[]
  // Non-fatal per-classroom unenroll failures; org removal still proceeds.
  warnings: string[]
  // Whether the org-membership DELETE succeeded.
  removed: boolean
}

// Reconstruct a minimal Student for the unenroll call from an aggregated row.
// unenrollStudent matches on username/github_id/email, all carried by the row.
const rowToStudent = (row: OrgMemberRow): Student => ({
  username: row.username,
  first_name: "",
  last_name: "",
  email: row.email,
  section: "",
  github_id: row.github_id,
  enrollment_status: "enrolled",
})

// Remove a student from the org without leaving any roster inconsistent (#76):
// unenroll them from every classroom they're on FIRST, then remove the org
// membership LAST. A per-classroom unenroll failure is surfaced as a warning and
// does not abort the others or the final removal — the org DELETE running last
// means a partial failure never strips membership while rosters stay populated.
export async function removeMemberFromOrg(
  client: GitHubClient,
  input: { org: string; row: OrgMemberRow },
): Promise<RemoveFromOrgResult> {
  const { org, row } = input
  const student = rowToStudent(row)
  const unenrolledClassrooms: string[] = []
  const warnings: string[] = []

  for (const access of row.classrooms) {
    try {
      await unenrollStudent(client, {
        org,
        classroom: access.classroom,
        student,
      })
      unenrolledClassrooms.push(access.classroom)
    } catch (err) {
      warnings.push(
        `Couldn't unenroll ${row.username || row.email} from "${access.classroom}" (${getErrorMessage(
          err,
        )}); removed the others.`,
      )
    }
  }

  let removed = false
  try {
    if (row.username) {
      await removeOrgMembership(client, { org, username: row.username })
      removed = true
    } else {
      warnings.push(
        `Couldn't remove ${row.email} from the organization: no GitHub username on file.`,
      )
    }
  } catch (err) {
    warnings.push(
      `Removing ${row.username} from the organization failed (${getErrorMessage(
        err,
      )}); retry from the organization's people page.`,
    )
  }

  return { unenrolledClassrooms, warnings, removed }
}
