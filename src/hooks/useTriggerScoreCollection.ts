import { useMutation, useQuery } from "@tanstack/react-query"

import { useGitHubClient } from "@/context/github/GitHubProvider"
import { useEffect, useState } from "react"
import { triggerScoreCollection } from "./github/mutations"
import { getLatestCollectScoresRun, githubKeys } from "./github/queries"

export type CollectScoresPhase =
  | "idle"
  | "dispatching"
  | "running"
  | "completed"
  | "failed"
  | "timeout"

// Stop polling for the dispatched run after this long; a run that hasn't
// registered or completed by now is treated as a timeout so the UI doesn't spin
// forever (and we don't poll the runs API indefinitely).
const POLL_TIMEOUT_MS = 10 * 60 * 1000
const POLL_INTERVAL_MS = 5000

/**
 * Triggers the collect-scores workflow and tracks the resulting run. After
 * dispatch we poll the latest matching workflow_dispatch run (the dispatch API
 * returns no run id) until it finishes or times out. `phase` is derived from the
 * mutation and the live run, so callers can react to completion (e.g. refetch
 * scores) via their own effect. `dispatchedAt` is never cleared, so a finished
 * run keeps `phase` latched at completed/failed/timeout until the next dispatch.
 */
const useTriggerScoreCollection = (org: string) => {
  const client = useGitHubClient()
  const [dispatchedAt, setDispatchedAt] = useState<string | null>(null)
  const [timedOut, setTimedOut] = useState(false)

  const mutation = useMutation({
    // Collect all classrooms (org-wide), matching the "Last collected" timestamp
    // semantics. To narrow to a single classroom later, pass its slug as the
    // third arg: triggerScoreCollection(client, org, classroom). The workflow
    // already accepts a `classroom` dispatch input.
    mutationFn: () => triggerScoreCollection(client, org),
    onSuccess: (result) => {
      setTimedOut(false)
      setDispatchedAt(result.dispatchedAt)
    },
  })

  const runQuery = useQuery({
    queryKey: githubKeys.collectScoresRun(org, dispatchedAt),
    queryFn: ({ signal }) =>
      getLatestCollectScoresRun(client, org, dispatchedAt ?? "", signal),
    enabled: Boolean(org && dispatchedAt && !timedOut),
    refetchInterval: (query) =>
      query.state.data?.status === "completed" ? false : POLL_INTERVAL_MS,
    staleTime: 0,
    gcTime: 0,
  })

  const run = runQuery.data
  const runCompleted = Boolean(dispatchedAt) && run?.status === "completed"

  // Bound the wait so a run that never registers or hangs doesn't poll forever;
  // on timeout we flip a flag that both stops the query (via `enabled`) and
  // latches `phase` to "timeout".
  useEffect(() => {
    if (!dispatchedAt || runCompleted || timedOut) return
    const id = window.setTimeout(() => setTimedOut(true), POLL_TIMEOUT_MS)
    return () => window.clearTimeout(id)
  }, [dispatchedAt, runCompleted, timedOut])

  let phase: CollectScoresPhase = "idle"
  if (mutation.isPending) phase = "dispatching"
  else if (mutation.isError) phase = "failed"
  else if (runCompleted)
    phase = run.conclusion === "success" ? "completed" : "failed"
  else if (timedOut) phase = "timeout"
  else if (dispatchedAt) phase = "running"

  return {
    collect: () => mutation.mutate(),
    phase,
    run,
    error: mutation.error,
  }
}

export default useTriggerScoreCollection
