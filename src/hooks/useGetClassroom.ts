import { useQuery } from "@tanstack/react-query"
import { jsonFileQuery } from "./github/queries"
import { useGitHubClient } from "@/context/github/GitHubProvider"

type ClassroomData = {
  schema: string
  name: string
  short_name: string
  term: string
  org: string
}
const useGetClassroom = (org: string, classroom: string) => {
  const client = useGitHubClient()
  return useQuery(
    jsonFileQuery<ClassroomData>(
      client,
      org,
      "classroom50",
      `${classroom}/classroom.json`,
    ),
  )
}

export default useGetClassroom
