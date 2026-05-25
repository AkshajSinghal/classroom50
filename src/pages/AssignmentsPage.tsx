import { Link, useParams } from "@tanstack/react-router"

import AssignmentsTable from "@/pages/assignments/AssignmentsTable"
import Breadcrumb from "@/components/breadcrumb"
import Drawer, {
  DrawerContent,
  DrawerSidebar,
  DrawerToggle,
} from "@/components/drawer"
import useGetClassroomAssignments from "@/hooks/useGetClassAssignments"

const AssignmentsPage = () => {
  const { org, classroom } = useParams({ strict: false })
  const { data: classData } = useGetClassroomAssignments(org, classroom)

  return (
    <div className="min-h-screen">
      <Drawer>
        <DrawerToggle />
        <DrawerContent className="p-10 bg-[#fafafa]">
          <Breadcrumb />
          <div className="flex justify-between">
            <div>
              <h1 className="text-lg pt-8 pb-2 font-bold">AP CS Principles</h1>
              <h3 className="pb-10">Spring 2026 • 28 Students</h3>
            </div>
            <div className="pt-10">
              <Link to="/cs50/cs50-2026/assignments/new">
                <button className="btn btn-primary">+ Assignment</button>
              </Link>
            </div>
          </div>
          <AssignmentsTable assignments={classData?.assignments} />
        </DrawerContent>
        <DrawerSidebar selected="assignments" />
      </Drawer>
    </div>
  )
}

export default AssignmentsPage
