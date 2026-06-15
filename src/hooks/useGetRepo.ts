import { useGitHubClient } from "@/context/github/GitHubProvider"
import { useQuery } from "@tanstack/react-query"
import { getRepo } from "./github/queries"

const useGetRepo = (org: string, path: string) => {
  const client = useGitHubClient()

  return useQuery({
    queryKey: ["github", "repo", org, path],
    queryFn: () => getRepo(client, org, path),
  })
}

export default useGetRepo
