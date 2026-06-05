import {
  ChartColumnIncreasing,
  MessageCircle,
  SquareArrowOutUpRight,
} from "lucide-react"

import { getName, getInitials } from "@/util/students"
import Avatar from "@/components/avatar"

// <= 50% = red
// >= 60% = yellow
// >= 70% = green
const scoreToBadgeType = (score: number, max: number) => {
  const percent = (score / max) * 100

  if (percent <= 50) return "badge-error"
  if (percent < 70) return "badge-warning"
  return "badge-success"
}

const SubmissionsTable = ({ scores, students }) => {
  return (
    <div className="overflow-x-auto rounded-box border border-base-content/5 bg-base-100">
      <table className="table">
        <thead>
          <tr>
            <th>Student</th>
            <th>Submissions</th>
            <th>Score</th>
            <th>Last Submitted</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {!scores?.length && (
            <tr>
              <td colSpan={5} className="text-center">
                No scores submitted!
              </td>
            </tr>
          )}
          {scores
            .sort((a, b) => a.datetime - b.datetime)
            .toReversed()
            .map(({ usernames, score, datetime, ...rest }) => (
              <tr>
                <td>
                  <Avatar
                    name={getName(usernames[0], students)}
                    initials={getInitials(usernames[0], students)}
                    github={usernames[0]}
                  />
                </td>
                <td>
                  <label className="badge">1 Submission</label>
                </td>
                <td>
                  <label
                    className={`badge badge-soft ${scoreToBadgeType(score, rest["max-score"])}`}
                  >
                    {score}/{rest["max-score"]}
                  </label>
                </td>
                <td>
                  {new Date(datetime).toLocaleString(undefined, {
                    dateStyle: "medium",
                    timeStyle: "short",
                  })}
                </td>
                <td>
                  <div className="flex gap-4">
                    <div>
                      <a
                        className="flex gap-2"
                        href={rest.commit}
                        target="_blank"
                        rel="noreferrer"
                      >
                        <SquareArrowOutUpRight />
                        <span>Commit</span>
                      </a>
                    </div>
                    <div>
                      <a
                        className="flex gap-2"
                        href={rest.review}
                        target="_blank"
                        rel="noreferrer"
                      >
                        <MessageCircle />
                        <span>Review</span>
                      </a>
                    </div>
                    <div>
                      <a
                        className="flex gap-2"
                        href={rest.release}
                        target="_blank"
                        rel="noreferrer"
                      >
                        <ChartColumnIncreasing />
                        <span>Details</span>
                      </a>
                    </div>
                  </div>
                </td>
              </tr>
            ))}
        </tbody>
      </table>
    </div>
  )
}

export default SubmissionsTable
