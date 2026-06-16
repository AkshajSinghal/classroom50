import Breadcrumb from "@/components/breadcrumb"
import Drawer, {
  DrawerContent,
  DrawerSidebar,
  DrawerToggle,
} from "@/components/drawer"
import { useCourseTeacherAccess } from "@/hooks/useCourseTeacherAccess"
import { useParams } from "@tanstack/react-router"

const EditAssignmentPage = () => {
  const { org, classroom } = useParams({ strict: false })
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
        </DrawerContent>
        <DrawerSidebar selected="assignments" isTeacher={isTeacher} />
      </Drawer>
    </div>
  )
}

export default EditAssignmentPage
