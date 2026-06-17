import Breadcrumb from "@/components/breadcrumb"
import Drawer, {
  DrawerContent,
  DrawerSidebar,
  DrawerToggle,
} from "@/components/drawer"
import { useCourseTeacherAccess } from "@/hooks/useCourseTeacherAccess"
import useGetAssignmentRepo from "@/hooks/useGetAssignmentRepo"
import useGetPublicAssignment from "@/hooks/useGetPublicAssignment"
import useGetRepoCollaborators from "@/hooks/useGetRepoCollaborators"
import { useForm } from "@tanstack/react-form"
import { Link, useNavigate, useParams } from "@tanstack/react-router"

const EditAssignmentFormTeacher = () => {
  return <div></div>
}

const EditAssignmentFormStudent = ({ org, classroom, assignment }) => {
  const { isLoading: loadingPublic, assignment: assignmentData } =
    useGetPublicAssignment(org, classroom, assignment)
  const { isLoading: loadingRepo, assignment: assignmentRepo } =
    useGetAssignmentRepo(org, classroom, assignment)
  const navigate = useNavigate()
  const { isLoading: loadingCollaborators, data: collaborators } =
    useGetRepoCollaborators(org, assignmentRepo?.name)

  const maxCollaborators = assignmentData?.max_group_size ?? 1

  // admins get collab access by default, so we want them to not count toward max group size
  const actualCollaborators = collaborators?.filter(
    (c) => c.permissions.admin !== true,
  )

  const assignmentMode = assignmentData?.mode

  const form = useForm({
    defaultValues: {
      collaborators: actualCollaborators || [],
    },
    validators: ({ value }) => {
      const errors: Record<string, string> = {}
      if (value.collaborators.length > maxCollaborators) {
        errors.collaborators = `Assignment has a max group size of ${maxCollaborators}`
      }

      return Object.keys(errors).length > 0 ? { fields: errors } : undefined
    },
    onSubmit: ({ value }) => {
      navigate({ to: `/${org}/${classroom}/assignments` })
    },
  })

  if (loadingPublic || loadingRepo) {
    return (
      <div className="flex">
        <div className="loading loading-spinner m-auto" />
      </div>
    )
  }

  if (!assignmentRepo) {
    return (
      <div className="alert alert-warning">
        You do not have this assignment yet! Do you need to{" "}
        <Link to={`/${org}/${classroom}/assignments/${assignment}/accept`}>
          accept it
        </Link>{" "}
        first?
      </div>
    )
  }

  if (assignmentMode === "individual") {
    return (
      <div className="alert alert-warning mt-6">
        This is an individual assignment. There is nothing available to edit as
        a Student at this time.
      </div>
    )
  }

  return (
    <div className="card bg-base-100 w-full shadow-sm mb-6 p-6 mt-6">
      <form></form>
    </div>
  )
}

const EditAssignmentPage = () => {
  const { org, classroom, assignment } = useParams({ strict: false })
  const { isTeacher, isStudent } = useCourseTeacherAccess(org)

  return (
    <div className="min-h-screen">
      <Drawer>
        <DrawerToggle />
        <DrawerContent className="p-10 bg-[#fafafa] 2xl:px-50">
          <Breadcrumb
            endpoint="Edit Assignment"
            isTeacher={isTeacher}
            classroom={classroom}
          />
          <h1 className="text-2xl font-bold mt-4">Edit Assignment</h1>
          {isTeacher && <EditAssignmentFormTeacher />}
          {isStudent && (
            <EditAssignmentFormStudent
              org={org}
              classroom={classroom}
              assignment={assignment}
            />
          )}
        </DrawerContent>
        <DrawerSidebar selected="assignments" isTeacher={isTeacher} />
      </Drawer>
    </div>
  )
}

export default EditAssignmentPage
