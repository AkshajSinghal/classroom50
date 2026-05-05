import { GraduationCap, BookText, Trash, UsersRound, UserRound, HardDriveUpload } from 'lucide-react'
import { Link } from '@tanstack/react-router'
import GitHub from '@/assets/github.svg?react'

const students = [
  { name: 'Andre D.', github: 'student-andre', initials: 'AD' },
  { name: 'Andrew M.', github: 'student-andrew', initials: 'AM' },
  { name: 'Anil M.', github: 'student-anil', initials: 'AM' },
  { name: 'Christina K.', github: 'student-christina', initials: 'CK' },
  { name: 'Douglas W.', github: 'student-douglas', initials: 'DW' },
  { name: 'Frank R.', github: 'student-frank', initials: 'FR' },
  { name: 'Jessica M.', github: 'student-jessica', initials: 'JM' },
  { name: 'Kayla B.', github: 'student-kayla', initials: 'KB' },
  { name: 'Mark H.', github: 'student-mark', initials: 'MH' },
  { name: 'Michael B.', github: 'student-michael', initials: 'MB' },
  { name: 'Nichole H.', github: 'student-nichole', initials: 'NH' },
  { name: 'Paul R.', github: 'student-paul', initials: 'PR' }
]

const StudentListPage = () => {
  return (
    <div className="min-h-screen">
      <div className="drawer lg:drawer-open">
        <div className="drawer-toggle">

        </div>
        <div className="drawer-content">
          <div>
            <Link to='/classes'>Classes</Link> &gt; <Link to='/assignments'>AP CS Principles</Link> &gt; Students
          </div>
          <h1>Students</h1>
          <h3>12 students enrolled in AP CS Principles</h3>
          <div className="grid grid-cols-12 gap-2">
            <div className="col-span-5 px-4">
              <div className="card card-border w-96 bg-base-100 shadow-sm">
                <div className="card-body">
                  <p>Add by GitHub Username</p>
                  <form>
                    <div className="flex">
                      <UserRound />
                      <input type="text" placeholder="Name (optional)" className="input" />
                    </div>
                    <div className="flex">
                      <GitHub />
                      <input type="text" placeholder="github-username" className="input" />
                    </div>
                    <button className="btn btn-primary">+ Add Student</button>
                  </form>
                </div>
              </div>
              <div className="card card-border w-96 bg-base-100 shadow-sm">
                <div className="card-body">
                  <p>Upload Roster</p>
                  <span>Upload a CSV or text file with one GitHub username per line.</span>
                  <button className="btn"><HardDriveUpload />Choose File</button>
                </div>
              </div>
            </div>
            <div className="col-span-7 px-4">
              <div className="card card-border w-full bg-base-100 overflow-hidden shadow-sm">
                <div className="flex items-center justify-between px-6 py-4 border-b border-base-300">
                  <h2 className="text-lg font-semibold">Enrolled Students</h2>

                  <div className="badge badge-primary badge-soft text-base">
                    12
                  </div>
                </div>

                <ul className="divide-y divide-base-300">
                  {students.map((student) => (
                    <li
                      key={student.github}
                      className="flex items-center gap-4 px-6 py-4"
                    >
                      <div className="avatar avatar-placeholder">
                        <div className="bg-base-200 text-primary rounded-full w-12">
                          <span>{student.initials}</span>
                        </div>
                      </div>

                      <div className="min-w-0 flex-1">
                        <div className="font-medium text-base-content">
                          {student.name}
                        </div>

                        <div className="flex items-center gap-1 text-sm text-base-content/60">
                          <GitHub className="size-4" />
                          <span>{student.github}</span>
                        </div>
                      </div>

                      <button className="btn btn-ghost btn-square text-error">
                        <Trash />
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </div>
        <div className="drawer-side bg-base-200">
          <div className="flex flex-col min-h-full w-60 min-w-30">
            <div className="flex"><GraduationCap /> Teacher</div>
            <div>
              <Link to='/classes'>&lt; All Classes</Link>
            </div>
            <div>
              <h3>AP CS Principles</h3>
              <p>Spring 2026</p>
            </div>
            <div>
              <ul>
                <li className="flex">
                  <BookText />
                  <span>Assignments</span>
                </li>
                <li className="flex">
                  <UsersRound />
                  <span>Students</span>
                </li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default StudentListPage
