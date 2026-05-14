import { GraduationCap, BookText, Trash, UsersRound, UserRound, HardDriveUpload } from 'lucide-react'
import { Link } from '@tanstack/react-router'
import GitHub from '@/assets/github.svg?react'

import AddByGithubUsername from '@/pages/students/AddByGithubUsername'
import AssignmentsTable from '@/pages/assignments/AssignmentsTable'
import Breadcrumb from '@/components/breadcrumb'
import Drawer, { DrawerContent, DrawerSidebar, DrawerToggle } from '@/components/drawer'
import EnrolledStudents from '@/pages/students/EnrolledStudents'
import UploadRoster from '@/pages/students/UploadRoster'

const AssignmentsPage = () => {
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
              <button className="btn btn-primary">+ Assignment</button>
            </div>
          </div>
          <AssignmentsTable />
        </DrawerContent>
        <DrawerSidebar selected='assignments' />
      </Drawer>
    </div>
  )
}

export default AssignmentsPage
