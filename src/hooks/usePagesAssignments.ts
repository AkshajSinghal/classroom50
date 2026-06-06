import { useQuery } from "@tanstack/react-query"
import { fetchPagesAssignments } from "./github/queries"

const usePagesAssignments = (org: string, classroom: string) => {
  return useQuery({
    queryKey: ["pages", "assignments", org, classroom],
    queryFn: () => fetchPagesAssignments(org, classroom),
  })
}

export default usePagesAssignments
