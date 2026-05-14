import { UserRound, UsersRound } from 'lucide-react'

const AssignmentsTable = ({ children }) => {
  return (
    <div className="overflow-x-auto rounded-box border border-base-content/5 bg-base-100">
      <div className="table">
        <thead>
          <tr>
            <th>Assignment</th>
            <th>Type</th>
            <th>Due Date</th>
            <th>Submissions</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Loops Assignment</td>
            <td className="flex"><UserRound /> Individual</td>
            <td><span className="badge badge-soft">Feb 14, 2026</span></td>
            <td>25 / 28 <progress className="progress progress-info w-56" value={25/28*100} max="100"></progress></td>
            <th className="text-[#233da0]">View &gt;</th>
          </tr>
          <tr>
            <td>Functions Assignment</td>
            <td className="flex"><UserRound /> Individual</td>
            <td><span className="badge badge-soft">Feb 28, 2026</span></td>
            <td>22 / 28 <progress className="progress progress-info w-56" value={22/28*100} max="100"></progress></td>
            <th className="text-[#233da0]">View &gt;</th>
          </tr>
          <tr>
            <td>Pointers Assignment</td>
            <td className="flex"><UsersRound /> Group</td>
            <td><span className="badge badge-soft">Mar 21, 2026</span></td>
            <td>15 / 28 <progress className="progress progress-info w-56" value={15/28*100} max="100"></progress></td>
            <th className="text-[#233da0]">View &gt;</th>
          </tr>
          <tr>
            <td>Arrays Assignment</td>
            <td className="flex"><UsersRound /> Group</td>
            <td><span className="badge badge-soft badge-primary">Apr 30, 2026</span></td>
            <td>0 / 28 <progress className="progress progress-info w-56" value={0/28*100} max="100"></progress></td>
            <th className="text-[#233da0]">View &gt;</th>
          </tr>
        </tbody>
      </div>
    </div>
  )
}

export default AssignmentsTable
