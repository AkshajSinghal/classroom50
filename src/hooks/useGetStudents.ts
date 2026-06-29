import { useQuery, useQueryClient } from "@tanstack/react-query"

import { useGitHubClient } from "@/context/github/GitHubProvider"
import { csvFileQuery, githubKeys } from "./github/queries"
import { toStudent } from "@/util/roster"
import type { Student } from "@/types/classroom"

const rosterKey = (org: string, classroom: string) =>
  githubKeys.csvFile(org, "classroom50", `${classroom}/students.csv`)

const useGetStudents = (
  org: string | undefined,
  classroom: string | undefined,
) => {
  const client = useGitHubClient()
  // Coerce every roster row through toStudent via `select` so
  // enrollment_status/method are narrowed to their unions (an unknown/off-list
  // value becomes "") rather than carried verbatim from a CLI-/hand-edited
  // students.csv — otherwise an odd value bypasses inviteStatus's branches and
  // can mis-bucket a row (#57 sub-item 3 / #52). `select` runs on both fetched
  // rows and optimistically-written cache entries, and toStudent is idempotent
  // over an already-typed Student, so the optimistic-update path is unaffected.
  const { data: students, isLoading } = useQuery({
    ...csvFileQuery<Student>(
      client,
      org ?? "",
      "classroom50",
      `${classroom ?? ""}/students.csv`,
    ),
    select: (rows) => rows.map((row) => toStudent(row)),
  })

  return {
    students: students || [],
    isLoading,
  }
}

// Optimistically patch the cached roster. GitHub's Contents API is eventually
// consistent per path: right after a commit it often still serves the previous
// students.csv, so an immediate refetch would clobber the cache with stale rows
// until a later refresh. Mutations already compute the authoritative post-write
// rows, so write them straight in and let a natural refetch reconcile. Pass a
// function mapping the current roster to the next.
export const useUpdateRosterCache = (
  org: string | undefined,
  classroom: string | undefined,
) => {
  const queryClient = useQueryClient()
  return (update: (current: Student[]) => Student[]) => {
    if (!org || !classroom) return
    const key = rosterKey(org, classroom)
    // Cancel any in-flight roster fetch first: a refetch started before the
    // commit (window-focus/reconnect) could resolve after this setQueryData and
    // clobber the optimistic write with stale rows. cancelQueries drops it.
    void queryClient.cancelQueries({ queryKey: key })
    queryClient.setQueryData<Student[]>(key, (current) => update(current ?? []))
  }
}

export default useGetStudents
