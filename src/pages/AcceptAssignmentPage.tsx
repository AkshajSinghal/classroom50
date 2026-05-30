import { GraduationCap, UserRound } from "lucide-react"

import GitHub from "@/assets/github.svg?react"
import GitHubWhite from "@/assets/github_white.svg?react"

const AcceptAssignmentPage = () => {
  return (
    <div className="bg-base-100">
      <div className="navbar bg-base-100 shadow-sm">
        <div className="flex p-6 text-lg font-bold">
          <GraduationCap className="size-8 text-[#accefb] mr-2" /> Classroom 50
        </div>
      </div>
      <div className="card w-200 p-8 m-auto rounded-xl mt-10 border border-[#eee]">
        <div className="card-body gap-4">
          <span className="badge badge-primary badge-soft">
            <UserRound />
            Individual Assignment
          </span>
          <h1 className="text-xl font-bold pt-6">Loops Assignment</h1>
          <h2 className="text-lg">
            Accept this assignment to get your own copy of the starter code
            repository.
          </h2>
          <div className="divider" />
          <label className="label text-lg">Signed in as</label>
          <div className="flex flex-col gap-8">
            <div className="flex gap-4 bg-[#fafafa] p-4 rounded-xl border border-[#ddd]">
              <div className="avatar avatar-placeholder">
                <div className="bg-base-200 text-black rounded-full w-12">
                  <span>CH</span>
                </div>
              </div>

              <div className="min-w-0 flex-1">
                <div className="font-medium text-base-content">
                  Christina H.
                </div>

                <div className="flex items-center gap-1 text-sm text-base-content/60">
                  <GitHub className="size-4" />
                  <span>student-christina</span>
                </div>
              </div>
            </div>
            <div className="flex gap-2 flex-col bg-[#fafafa] p-4 rounded-xl border border-[#ddd]">
              <label className="label text-lg">
                Repository will be created as:
              </label>
              <div className="flex gap-4">
                <GitHub className="size-6" />
                <pre className="text-lg">
                  my-classroom-org/loops-assignment-student-christina
                </pre>
              </div>
            </div>
            <button className="btn btn-primary w-full text-xl p-8">
              <GitHubWhite className="size-6" />
              Accept Assignment & Create Repository
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

export default AcceptAssignmentPage
