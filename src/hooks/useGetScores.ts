import { useQuery } from "@tanstack/react-query"

import { useGitHubClient } from "@/context/github/GitHubProvider"
import { jsonFileQuery } from "./github/queries"

type Score = {
  usernames: string[]
  datetime: string
  commit: string
  release: string
  review: string
  score: number
  "max-score": number
}
type ScoresSchema = {
  schema: string
  submissions: Record<string, Score[]>
}
const useGetScores = (org, classroom) => {
  const client = useGitHubClient()
  return useQuery(
    jsonFileQuery<ScoresSchema>(
      client,
      org,
      "classroom50",
      `${classroom}/scores.json`,
    ),
  )
}

export default useGetScores
