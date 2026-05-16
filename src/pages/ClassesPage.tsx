import { ArrowDownWideNarrow, GraduationCap, BookText, HardDriveDownload, Trash, UsersRound, UserRound } from 'lucide-react'
import { Link } from '@tanstack/react-router'
import GitHub from '@/assets/github.svg?react'

import AddByGithubUsername from '@/pages/students/AddByGithubUsername'
import AssignmentsTable from '@/pages/assignments/AssignmentsTable'
import Breadcrumb from '@/components/breadcrumb'
import Drawer, { DrawerContent, DrawerSidebar, DrawerToggle } from '@/components/drawer'
import EnrolledStudents from '@/pages/students/EnrolledStudents'
import SubmissionsTable from '@/pages/submissions/SubmissionsTable'
import UploadRoster from '@/pages/students/UploadRoster'

const classes = [
  { active: true, term: 'Spring 2026', title: 'AP CS Principles', students: 28, org: 'my-classroom-org' },
  { active: true, term: 'Spring 2026', title: 'Intro Java', students: 32, org: 'my-classroom-org' },
  { active: false, term: 'Fall 2025', title: 'Game Development', students: 18, org: 'my-classroom-org' },
  { active: false, term: 'Fall 2025', title: 'Web Development', students: 24, org: 'my-classroom-org' },
]

const ClassCard = ({ cl }) => {
  return (
    <div className="card bg-base-100 rounded-xl col-span-6 border border-[#eee]">
      <div className="card-body gap-4">
        <label className={`badge badge-soft ${cl.active ? 'badge-success' : 'badge-primary'}`}>{cl.term}</label> 
        <h1 className="text-xl">{cl.title}</h1>
        <div className="flex gap-2">
          <UsersRound />
          {cl.students} students
        </div>
        <div className="flex gap-2">
          <GitHub className="size-4 opacity-25" />
          <pre>{cl.org}</pre>
        </div>
        <button className="btn btn-outline btn-primary w-full">
          <BookText />
          View Assignments
        </button>
      </div>
    </div>
  )
}

const ClassesPage = () => {
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
            {classes.map((cl) => <ClassCard cl={cl} />)}
          </div>
        </DrawerContent>
        <DrawerSidebar page='classes' selected='assignments' />
      </Drawer>
    </div>
  )
}

export default ClassesPage
