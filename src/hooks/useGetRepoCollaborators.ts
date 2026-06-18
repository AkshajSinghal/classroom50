import { useGitHubClient } from "@/context/github/GitHubProvider"
import { useQuery } from "@tanstack/react-query"
import type { GitHubUser } from "./github/types"

const useGetRepoCollaborators = (org: string, repoName: string) => {
  const client = useGitHubClient()

  return useQuery({
    queryKey: ["github", "collaborators", org, repoName],
    queryFn: () => {
      return client.request<GitHubUser[]>(
        `/repos/${org}/${repoName}/collaborators`,
      )
    },
    staleTime: 10 * 60 * 1000,
    enabled: Boolean(org && repoName),
  })
}

export default useGetRepoCollaborators
