import useGetOrgRepos from "./useGetMyOrgRepos"

const useGetAssignmentRepo = (
  org: string,
  classroom: string,
  assignment: string,
  username: string,
) => {
  const assignmentRepos = useGetOrgRepos(org)

  return {
    ...assignmentRepos,
    assignment: assignmentRepos.data?.find((repo) =>
      repo.name.startsWith(`${classroom}-${assignment}-${username}`),
    ),
  }
}

export default useGetAssignmentRepo
