import { Navigate, useParams } from "@tanstack/react-router"
import { isStaffRole } from "@/hooks/useClassroomRole"
import { useClassroomRoleContext } from "@/context/classroomRole/ClassroomRoleProvider"

// The bare assignment route has no view of its own: it forwards to the
// role-appropriate landing (staff → submissions gradebook, students → their
// own submission). The $org/$classroom boundary already resolved the role, so
// we forward immediately with no resolution-window handling of our own.
const AssignmentIndexPage = () => {
  const { org, classroom, assignment } = useParams({ strict: false })
  const { role } = useClassroomRoleContext()

  if (!org || !classroom || !assignment) {
    return <Navigate to="/" />
  }

  return (
    <Navigate
      to={
        isStaffRole(role)
          ? "/$org/$classroom/assignments/$assignment/submissions"
          : "/$org/$classroom/assignments/$assignment/submission"
      }
      params={{ org, classroom, assignment }}
      replace
    />
  )
}

export default AssignmentIndexPage
