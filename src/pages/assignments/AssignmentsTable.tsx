import { UserRound, UsersRound } from "lucide-react"

const AssignmentsTable = ({ assignments, students = [] }) => {
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
          {assignments?.map((assignment) => (
            <tr>
              <td>{assignment.name}</td>
              <td className="flex">
                {assignment.mode === "individual" && (
                  <>
                    <UserRound /> Individual Assignment
                  </>
                )}
                {assignment.mode === "group" && (
                  <>
                    <UsersRound /> Group Assignment
                  </>
                )}
              </td>
              <td>
                {/* TODO: decide how due dates are stored in assignments schema? */}
                <span className="badge badge-soft">
                  {assignment.due_date || "Jun 1, 2026"}
                </span>
              </td>
              <td>
                {/* need to grab # of submissions and # of total students here */}
                {assignment.submissions || 0} / {students.length}{" "}
                <progress
                  className="progress progress-info w-56"
                  value={
                    students.length === 0
                      ? 0
                      : (assignment.submissions / students.length) * 100
                  }
                  max="100"
                ></progress>
              </td>
              <th className="text-[#233da0]">View &gt;</th>
            </tr>
          ))}
        </tbody>
      </div>
    </div>
  )
}

export default AssignmentsTable
