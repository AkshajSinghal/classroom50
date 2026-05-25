import {
  ChartColumnIncreasing,
  MessageCircle,
  SquareArrowOutUpRight,
} from "lucide-react"

import Avatar from "@/components/avatar"

const submissions = [
  {
    name: "Frank R.",
    github: "student-frank",
    initials: "FR",
    submissions: 1,
    score: 20,
    last_submitted: "2026-02-15 10:01",
  },
  {
    name: "Christina K.",
    github: "student-christina",
    initials: "CK",
    submissions: 2,
    score: 30,
    last_submitted: "2026-02-15 08:47",
  },
  {
    name: "Kayla B.",
    github: "student-kayla",
    initials: "KB",
    submissions: 2,
    score: 35,
    last_submitted: "2026-02-14 20:10",
  },
  {
    name: "Douglas W.",
    github: "student-douglas",
    initials: "DW",
    submissions: 4,
    score: 45,
    last_submitted: "2026-02-14 17:22",
  },
  {
    name: "Andrew M.",
    github: "student-andrew",
    initials: "AM",
    submissions: 3,
    score: 40,
    last_submitted: "2026-02-14 14:55",
  },
  {
    name: "Andre D.",
    github: "student-andre",
    initials: "AD",
    submissions: 5,
    score: 45,
    last_submitted: "2026-02-14 11:32",
  },
  {
    name: "Anil M.",
    github: "student-anil",
    initials: "AM",
    submissions: 7,
    score: 50,
    last_submitted: "2026-02-13 09:14",
  },
  {
    name: "Jessica M.",
    github: "student-jessica",
    initials: "JM",
    submissions: 6,
    score: 50,
    last_submitted: "2026-02-12 15:33",
  },
]

// <= 50% = red
// >= 60% = yellow
// >= 70% = green
const scoreToBadgeType = (score, max) => {
  let percent = (score / max) * 100

  if (percent <= 50) return "badge-error"
  if (percent < 70) return "badge-warning"
  return "badge-success"
}

const capitalize = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : "")

const getName = (key, students) => {
  const student = students.find((s) => s.username === key)
  return `${capitalize(student?.first_name)} ${capitalize(student?.last_name.slice(0, 1)) + "."}`
}

const getInitials = (key, students) => {
  const student = students.find((s) => s.username === key)
  return `${capitalize(student?.first_name.slice(0, 1)) + capitalize(student?.last_name.slice(0, 1))}`
}

const SubmissionsTable = ({ org, classroom, assignment, scores, students }) => {
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
          {scores.map(({ usernames, score, datetime, ...rest }) => (
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
              <td>{datetime}</td>
              <td>
                <div className="flex gap-4">
                  <div className="flex gap-2">
                    <SquareArrowOutUpRight />
                    <span>Commit</span>
                  </div>
                  <div className="flex gap-2">
                    <MessageCircle />
                    <span>Review</span>
                  </div>
                  <div className="flex gap-2">
                    <ChartColumnIncreasing />
                    <span>Details</span>
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
