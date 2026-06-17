import { useGitHubClient } from "@/context/github/GitHubProvider"
import { useQuery } from "@tanstack/react-query"

const useGetRepoCollaborators = (org: string, repoName: string) => {
  const client = useGitHubClient()

  return useQuery({
    queryKey: ["github", "collaborators", org, repoName],
    queryFn: () => {
      return client.request(`/repos/${org}/${repoName}/collaborators`)
    },
    staleTime: 10 * 60 * 1000,
    enabled: Boolean(org && repoName),
  })
}

export default useGetRepoCollaborators
