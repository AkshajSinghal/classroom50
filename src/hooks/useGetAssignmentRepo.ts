import useGetOrgRepos from "./useGetMyOrgRepos"
import { studentRepoName } from "@/util/studentRepo"

const useGetAssignmentRepo = (
  org: string,
  classroom: string,
  assignment: string,
  username: string | undefined,
) => {
  const assignmentRepos = useGetOrgRepos(org)

  // Exact match on the fully-qualified repo name, guarded on a present
  // username. A prefix/startsWith match would (a) match an arbitrary student's
  // repo when username is transiently empty and (b) collide between logins
  // sharing a prefix (alice vs alice2) or assignments sharing a prefix.
  const expectedName = username
    ? studentRepoName(classroom, assignment, username)
    : null

  return {
    ...assignmentRepos,
    assignment: expectedName
      ? assignmentRepos.data?.find(
          (repo) => repo.name.toLowerCase() === expectedName,
        )
      : undefined,
  }
}

export default useGetAssignmentRepo
