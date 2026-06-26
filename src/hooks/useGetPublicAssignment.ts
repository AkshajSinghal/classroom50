import { useQuery } from "@tanstack/react-query"
import { fetchPagesAssignments } from "./github/queries"
import useGetClassroom from "./useGetClassroom"

const useGetPublicAssignment = (
  org: string | undefined,
  classroom: string | undefined,
  assignment: string | undefined,
) => {
  // Pull the optional secret from classroom.json so a protected classroom's
  // assignments.json is fetched from <classroom>/<secret>/; unprotected
  // classrooms (no secret) use the plain path.
  const { data: classroomData, isLoading: classroomLoading } = useGetClassroom(
    org,
    classroom,
  )
  const secret = classroomData?.secret

  const assignmentQuery = useQuery({
    queryKey: ["pages", org, classroom, secret ?? ""],
    queryFn: () => fetchPagesAssignments(org ?? "", classroom ?? "", secret),
    enabled: Boolean(org && classroom) && !classroomLoading,
    staleTime: 10 * 60 * 1000,
    retry: false,
  })

  return {
    ...assignmentQuery,
    assignment: assignmentQuery.data?.find((a) => a.slug === assignment),
  }
}

export default useGetPublicAssignment
