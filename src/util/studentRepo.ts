// The student/group repo name follows the cross-binary formula
// `<classroom>-<assignment>-<owner>` (lowercased), the same one the CLI and
// `gh student accept` use. `owner` is the repo-name component (student for
// individual, group owner for group), so the name is stable regardless of who
// pushed last. Shared with the out-of-repo Go CLI — keep as the single source
// of truth so call sites can't drift.
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
