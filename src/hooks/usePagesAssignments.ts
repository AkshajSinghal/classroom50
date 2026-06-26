import { useQuery } from "@tanstack/react-query"
import { fetchPagesAssignments } from "./github/queries"
import useGetClassroom from "./useGetClassroom"

const usePagesAssignments = (
  org: string | undefined,
  classroom: string | undefined,
) => {
  // Resolve the optional capability-URL secret from the team-gated
  // classroom.json. A protected classroom serves assignments.json under
  // <classroom>/<secret>/; an unprotected one (no secret) uses the plain
  // path. Gating the fetch on the classroom query keeps the URL correct.
  const { data: classroomData, isLoading: classroomLoading } = useGetClassroom(
    org,
    classroom,
  )
  const secret = classroomData?.secret

  return useQuery({
    queryKey: ["pages", "assignments", org, classroom, secret ?? ""],
    queryFn: () => fetchPagesAssignments(org ?? "", classroom ?? "", secret),
    enabled: Boolean(org && classroom) && !classroomLoading,
  })
}

export default usePagesAssignments
