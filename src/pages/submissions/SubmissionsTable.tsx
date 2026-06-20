import {
  ChartColumnIncreasing,
  MessageCircle,
  SquareArrowOutUpRight,
} from "lucide-react"

import GitHub from "@/assets/github.svg?react"
import { getName, getInitials } from "@/util/students"
import { studentRepoName, studentRepoUrl } from "@/util/studentRepo"
import Avatar from "@/components/avatar"
import type { SubmissionRow } from "@/hooks/useGetScores"
import type { Student } from "@/types/classroom"

// <= 50% = red
// >= 60% = yellow
// >= 70% = green
// A vacuous/ungraded result (no autograder) has max === 0; show it neutral
// rather than letting NaN% fall through to green.
const scoreToBadgeType = (score: number, max: number) => {
  if (!max) return "badge-ghost"

  const percent = (score / max) * 100

  if (percent <= 50) return "badge-error"
  if (percent < 70) return "badge-warning"
  return "badge-success"
}

// Repo name/URL follow the shared cross-binary formula — see studentRepo.ts.
const repoName = studentRepoName
const repoUrl = studentRepoUrl

// A compact initials bubble with a tooltip naming the member — keeps a
// multi-member group row tight, moving identity into hover.
const MiniAvatar = ({
  username,
  students,
}: {
  username: string
  students: Student[]
}) => {
  const name = getName(username, students)
  const label = name ? `${name} · ${username}` : username
  return (
    <div className="tooltip" data-tip={label}>
      <div className="avatar avatar-placeholder">
        <div className="bg-base-200 text-primary rounded-full w-7 ring-2 ring-base-100">
          <span className="text-xs">
            {getInitials(username, students) || username.at(0)?.toUpperCase()}
          </span>
        </div>
      </div>
    </div>
  )
}

// A group submission credits every rostered collaborator. Compact layout: the
// shared repo (the real group identity) on top, then an overlapping avatar
// stack with member names in per-avatar tooltips.
const GroupMembers = ({
  usernames,
  students,
  repoHref,
  repoLabel,
}: {
  usernames: string[]
  students: Student[]
  repoHref: string
  repoLabel: string
}) => (
  <div className="flex flex-col gap-1.5">
    <a
      className="flex items-center gap-1.5 link link-hover w-fit font-medium"
      href={repoHref}
      target="_blank"
      rel="noreferrer"
      title="Open the shared group repository"
    >
      <GitHub className="size-4 shrink-0" />
      <span className="font-mono text-sm">{repoLabel}</span>
    </a>

    <div className="flex items-center gap-2">
      <div className="flex -space-x-2">
        {usernames.map((username) => (
          <MiniAvatar key={username} username={username} students={students} />
        ))}
      </div>
      <span className="text-xs text-base-content/60">
        {usernames.length} {usernames.length === 1 ? "member" : "members"}
      </span>
    </div>
  </div>
)

const SubmissionsTable = ({
  scores,
  students,
  isGroup = false,
  org,
  classroom,
  assignment,
}: {
  scores: SubmissionRow[]
  students: Student[]
  isGroup?: boolean
  org: string
  classroom: string
  assignment: string
}) => {
  return (
    <div className="overflow-x-auto rounded-box border border-base-content/5 bg-base-100">
      <table className="table">
        <thead>
          <tr>
            <th>{isGroup ? "Group" : "Student"}</th>
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
            .slice()
            .sort(
              (a, b) =>
                new Date(a.datetime).getTime() -
                new Date(b.datetime).getTime(),
            )
            .toReversed()
            .map(({ usernames, score, datetime, submissionCount, ...rest }) => (
              <tr key={rest.owner}>
                <td>
                  {isGroup ? (
                    <GroupMembers
                      usernames={usernames}
                      students={students}
                      repoHref={repoUrl(org, classroom, assignment, rest.owner)}
                      repoLabel={repoName(classroom, assignment, rest.owner)}
                    />
                  ) : (
                    <div className="flex flex-col gap-2">
                      <Avatar
                        name={getName(usernames[0], students)}
                        initials={getInitials(usernames[0], students)}
                        github={usernames[0]}
                      />
                      <a
                        className="flex items-center gap-1 text-sm link link-hover w-fit text-base-content/70"
                        href={repoUrl(org, classroom, assignment, rest.owner)}
                        target="_blank"
                        rel="noreferrer"
                        title="Open the student repository"
                      >
                        <GitHub className="size-4" />
                        <span className="font-mono">
                          {repoName(classroom, assignment, rest.owner)}
                        </span>
                      </a>
                    </div>
                  )}
                </td>
                <td>
                  <label className="badge max-xl:text-xs whitespace-nowrap">
                    {submissionCount}{" "}
                    {submissionCount === 1 ? "Submission" : "Submissions"}
                  </label>
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
                  <div className="flex gap-4 max-xl:[&>div>a]:flex-col">
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
