import { useQuery } from "@tanstack/react-query"
import { getPendingOrgInvite } from "./github/mutations"
import { useGitHubClient } from "@/context/github/GitHubProvider"

const useGetOwnOrgMembership = (org: string) => {
  const client = useGitHubClient()

  return useQuery({
    queryKey: ["github", "memberships", "orgs", org],
    queryFn: () => getPendingOrgInvite(client, org),
  })
}

export default useGetOwnOrgMembership
