import useGetOrgRepos from "./useGetMyOrgRepos"

const useGetAssignmentRepo = (
  org: string,
  classroom: string,
  assignment: string,
) => {
  const assignmentRepos = useGetOrgRepos(org)

  return {
    ...assignmentRepos,
    assignment: assignmentRepos.data?.find((repo) =>
      repo.name.startsWith(`${classroom}-${assignment}`),
    ),
  }
}

export default useGetAssignmentRepo
