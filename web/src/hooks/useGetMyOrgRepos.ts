import { useGitHubClient } from "@/context/github/GitHubProvider"
import { useQuery } from "@tanstack/react-query"
import { getOrgRepos } from "./github/queries"

const useGetOrgRepos = (org: string, enabled = true) => {
  const client = useGitHubClient()

  return useQuery({
    queryKey: ["orgs", org, "repos"],
    queryFn: () => getOrgRepos(client, org),
    // The org repo list can 403 for a non-owner; callers with a non-owner view
    // that doesn't need the acceptance count pass `enabled: false`.
    enabled: enabled && Boolean(org),
    // Drives the "Accepted" count from repo existence; keep it fresh so a tab
    // refocus reflects newly accepted assignments instead of a 10-min cache.
    staleTime: 20 * 1000,
  })
}

export default useGetOrgRepos
