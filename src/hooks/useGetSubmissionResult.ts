import { useQuery } from "@tanstack/react-query"
import { useGitHubClient } from "@/context/github/GitHubProvider"
import { latestReleaseResultQuery } from "./github/queries"
import { studentRepoName } from "@/util/studentRepo"
import type { ResultJson } from "@/types/result"

// Reads the logged-in student's most recent graded submission for an
// assignment. The autograder publishes result.json as an asset on each
// submit/* release of the student's repo (<classroom>-<assignment>-<username>)
// and marks the newest one "latest", so we resolve /releases/latest and pull
// its result.json. `data` is null when the student has not submitted yet.
const useGetSubmissionResult = (
  org: string | undefined,
  classroom: string | undefined,
  assignment: string | undefined,
  username: string | undefined,
) => {
  const client = useGitHubClient()

  const repo =
    classroom && assignment && username
      ? studentRepoName(classroom, assignment, username)
      : ""

  return useQuery({
    ...latestReleaseResultQuery<ResultJson>(client, org ?? "", repo),
    enabled: Boolean(org && repo),
    // Defensive normalization: a malformed/partial result.json must not crash
    // the render (StudentSubmissionPage reads result.tests.length/.map). Coerce
    // `tests` to an array so a bad asset degrades to "no tests" rather than a
    // white screen; null (no submission yet) passes through untouched.
    select: (data) =>
      data
        ? { ...data, tests: Array.isArray(data.tests) ? data.tests : [] }
        : data,
  })
}

export default useGetSubmissionResult
