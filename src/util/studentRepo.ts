// The student/group repo name follows the cross-binary formula
// `<classroom>-<assignment>-<owner>` (lowercased), the same one the CLI and
// `gh student accept` use. The `owner` is the repo-name component (the
// student username for individual work, the group owner for group work), so
// the name is stable regardless of which group member pushed last.
//
// This is a contract shared with the out-of-repo Go CLI; keep it as the
// single source of truth in the GUI so the call sites can't drift.
export const studentRepoName = (
  classroom: string,
  assignment: string,
  owner: string,
): string => `${classroom}-${assignment}-${owner}`.toLowerCase()

export const studentRepoUrl = (
  org: string,
  classroom: string,
  assignment: string,
  owner: string,
): string =>
  `https://github.com/${org}/${studentRepoName(classroom, assignment, owner)}`
