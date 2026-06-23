import { useQuery } from "@tanstack/react-query"

import { useGitHubClient } from "@/context/github/GitHubProvider"
import { getLastCollectScoresRun, githubKeys } from "./github/queries"

// The most recent collect-scores run (cron or manual), so teachers can see when
// scores were last collected. Returns null if the workflow has never run.
const useGetLastCollectScoresRun = (org: string) => {
  const client = useGitHubClient()

  return useQuery({
    queryKey: githubKeys.lastCollectScoresRun(org),
    queryFn: ({ signal }) => getLastCollectScoresRun(client, org, signal),
    enabled: Boolean(org),
    staleTime: 60 * 1000,
    retry: false,
  })
}

export default useGetLastCollectScoresRun
