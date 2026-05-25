import { useEffect } from "react"
import { useParams, Link } from "@tanstack/react-router"
import { BookText, UsersRound } from "lucide-react"
import GitHub from "@/assets/github.svg?react"

import useGetClassroomAssignments from "@/hooks/useGetClassAssignments"
import useGetClasses from "@/hooks/useGetClasses"

import Drawer, {
  DrawerContent,
  DrawerSidebar,
  DrawerToggle,
} from "@/components/drawer"

const classes = [
  {
    active: true,
    term: "Spring 2026",
    title: "AP CS Principles",
    students: 28,
    org: "my-classroom-org",
  },
  {
    active: true,
    term: "Spring 2026",
    title: "Intro Java",
    students: 32,
    org: "my-classroom-org",
  },
  {
    active: false,
    term: "Fall 2025",
    title: "Game Development",
    students: 18,
    org: "my-classroom-org",
  },
  {
    active: false,
    term: "Fall 2025",
    title: "Web Development",
    students: 24,
    org: "my-classroom-org",
  },
]

const ClassCard = ({ cl, org }: { cl: any; org: string }) => {
  const { data: classData } = useGetClassroomAssignments(org, cl.path)

  useEffect(() => {
    console.log("class", cl)
  }, [cl])

  useEffect(() => {
    console.log("classData", classData)
  }, [classData])

  return (
    <div className="card bg-base-100 rounded-xl col-span-6 border border-[#eee]">
      <div className="card-body gap-4">
        <label
          className={`badge badge-soft ${cl.active ? "badge-success" : "badge-primary"}`}
        >
          {cl.term || "No Term Specified"}
        </label>
        <h1 className="text-xl">{cl.title || "Unknown Class Name"}</h1>
        <div className="flex gap-2">
          <UsersRound />
          {typeof cl.students === "number"
            ? `${cl.students} Students`
            : `Invalid Student Count`}
        </div>
        <div className="flex gap-2">
          <GitHub className="size-4 opacity-25" />
          <pre>{cl.org || "No Org Specified"}</pre>
        </div>
        {classData?.assignments.length ? (
          <Link
            type="button"
            to={`/${org}/${cl.path}/assignments`}
            className="btn btn-outline btn-primary w-full"
          >
            <BookText />
            View Assignments
          </Link>
        ) : (
          <button type="button" className="btn btn-disabled w-full">
            No Assignments
          </button>
        )}
      </div>
    </div>
  )
}

const ClassesPage = () => {
  const params = useParams({ from: "/$org/" })
  const { data: classesData } = useGetClasses(params.org)

  return (
    <div className="min-h-screen">
      <Drawer>
        <DrawerToggle />
        <DrawerContent className="p-10 bg-[#fafafa]">
          <div className="flex justify-between">
            <div>
              <h1 className="text-lg pt-8 pb-2 font-bold">My Classes</h1>
              <div className="flex pb-10">
                <label>Manage your courses and assignments</label>
              </div>
            </div>
            <div className="pt-10">
              <button className="btn btn-primary">+ New Class</button>
            </div>
          </div>
          <div className="grid grid-cols-12 gap-4 mb-6">
            {classesData
              ?.filter((cl) => cl.type === "dir" && cl.name !== ".github")
              .map((cl) => (
                <ClassCard cl={cl} org={params.org} />
              ))}
          </div>
        </DrawerContent>
        <DrawerSidebar page="classes" selected="assignments" />
      </Drawer>
    </div>
  )
}

export default ClassesPage
