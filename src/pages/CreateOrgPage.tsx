import Breadcrumb from "@/components/breadcrumb"
import Drawer, {
  DrawerContent,
  DrawerSidebar,
  DrawerToggle,
} from "@/components/drawer"
import { slugify } from "./classes/CreateClassroomForm"
import { useMutation } from "@tanstack/react-query"

const CreateOrgPage = () => {
  const createOrgMutation = useMutation(createOrg())
  return (
    <div className="min-h-screen">
      <Drawer>
        <DrawerToggle />
        <DrawerContent className="p-10 bg-[#fafafa] 2xl:px-50">
          <Breadcrumb endpoint="New Assignment" />
          <div className="flex justify-between">
            <div>
              <h1 className="text-xl pt-8 pb-10 font-bold">
                Create Assignment
              </h1>
            </div>
          </div>
          <div className="flex flex-col">
            <div className="mb-8">
              <CreateOrgForm
                onSubmit={(values) =>
                  createOrgMutation.mutateAsync({
                    name: values.name,
                    slug: slugify(values.name),
                  })
                }
              />
            </div>
          </div>
        </DrawerContent>
        <DrawerSidebar selected="assignments" />
      </Drawer>
    </div>
  )
}

export default CreateOrgPage
