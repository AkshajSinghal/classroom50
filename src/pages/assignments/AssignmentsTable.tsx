import { useNavigate } from "@tanstack/react-router"
import { Pencil, UserRound, UsersRound } from "lucide-react"

import useGetScores from "@/hooks/useGetScores"
import { formatDueDate } from "@/util/formatDate"
import { Link } from "@tanstack/react-router"

const AssignmentsTable = ({ org, classroom, assignments, students = [] }) => {
  const { data: scoresData } = useGetScores(org, classroom)
  const navigate = useNavigate()

  return (
    <div className="overflow-x-auto rounded-box border border-base-content/5 bg-base-100">
      <table className="table">
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
          {!assignments?.length && (
            <tr>
              <td colSpan={5} className="text-center">
                No assignments created.
              </td>
            </tr>
          )}
          {assignments?.map((assignment) => (
            <tr
              key={assignment.slug}
              className="hover:cursor-pointer hover:bg-[#fafafa] h-14"
              onClick={() =>
                navigate({
                  to: `/${org}/${classroom}/assignments/${assignment.slug}/submissions`,
                })
              }
            >
              <td className="font-bold link link-info no-underline">
                {assignment.name}
              </td>
              <td className="flex align-middle items-center h-14">
                {assignment.mode === "individual" && (
                  <div className="flex gap-2">
                    <UserRound /> Individual
                  </div>
                )}
                {assignment.mode === "group" && (
                  <div className="flex gap-2">
                    <UsersRound /> Group
                  </div>
                )}
              </td>
              <td>
                <span className="badge badge-soft max-xl:text-xs xl:text-sm">
                  {assignment.due
                    ? formatDueDate(assignment.due)
                    : "No due date"}
                </span>
              </td>
              <td>
                {/* TODO: need to grab # of submissions and # of total students here */}
                {scoresData?.submissions?.[assignment.slug]?.length || 0} /{" "}
                {students.length}{" "}
                <progress
                  className="progress progress-info w-56"
                  value={
                    students.length === 0
                      ? 0
                      : ((scoresData?.submissions?.[assignment.slug]?.length ||
                          0) /
                          students.length) *
                        100
                  }
                  max="100"
                ></progress>
              </td>
              <td>
                <Link
                  className="btn btn-circle btn-sm btn-ghost"
                  to={`/${org}/${classroom}/assignments/${assignment.slug}/edit`}
                >
                  <Pencil className="size-4" />
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export default AssignmentsTable
