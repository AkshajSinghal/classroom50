import { useQuery } from "@tanstack/react-query"
import { jsonFileQuery } from "./github/queries"
import { useGitHubClient } from "@/context/github/GitHubProvider"

type AssignmentsSchema = {
  assignments: {
    slug: string
    name: string
    template: {
      owner: string
      repo: string
      branch: string
    }
    mode: string
    autograder: string
    runtime: {
      container: {
        image: string
        user: string
      }
    }
  }[]
}
const useGetClassroomAssignments = (org: string, classroom: string) => {
  const client = useGitHubClient()
  return useQuery(
    jsonFileQuery<AssignmentsSchema>(
      client,
      org,
      "classroom50",
      `${classroom}/assignments.json`,
    ),
  )
}

export default useGetClassroomAssignments
