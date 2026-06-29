import { useState } from "react"
import { useMutation, useQueryClient } from "@tanstack/react-query"

import { useGitHubClient } from "@/context/github/GitHubProvider"
import { useSafeSubmit } from "@/hooks/useSafeSubmit"
import {
  initClassroom50,
  type InitStepId,
  type InitStepUpdate,
} from "@/hooks/github/mutations"
import { githubKeys } from "@/hooks/github/queries"
import useGetOrgMembership from "@/hooks/useGetOrgMembership"
import useGetOrgPlanDetails from "@/hooks/useGetOrgPlanDetails"
import {
  InitStepBoard,
  applyStepUpdate,
  initialInitSteps,
} from "./initStepBoard"

// Re-run onboarding from Org Settings: re-invokes the idempotent
// initClassroom50 to re-apply the full lockdown, rulesets, and repo settings.
// Owner-gated; shows the same badge board the wizard uses. This is the
// "repair everything" path that complements the per-concern audit (U5/U6).
const RerunOnboarding = ({ org }: { org: string }) => {
  const client = useGitHubClient()
  const queryClient = useQueryClient()
  const runRerun = useSafeSubmit()

  const { data: membership } = useGetOrgMembership(org)
  const { data: planDetails } = useGetOrgPlanDetails(org)
  const isOwner = membership?.role === "admin"

  const [steps, setSteps] =
    useState<Record<InitStepId, InitStepUpdate>>(initialInitSteps)
  const [started, setStarted] = useState(false)

  const mutation = useMutation({
    mutationFn: async () => {
      setStarted(true)
      setSteps(initialInitSteps)
      return initClassroom50({
        client,
        org,
        plan: planDetails?.plan.name,
        serviceToken: "",
        serviceAccountConfirmed: false,
        onStepUpdate: (update) => {
          setSteps((prev) => applyStepUpdate(prev, update))
        },
      })
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: githubKeys.orgAudit(org) })
      void queryClient.invalidateQueries({ queryKey: ["orgs"] })
    },
  })

  return (
    <section className="mt-8 rounded-2xl border border-base-300 bg-base-100 p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold">Re-run setup</h2>
          <p className="mt-1 text-sm text-base-content/60">
            Re-apply every Classroom 50 organization setting. Safe to run any
            time — it only changes settings that have drifted.
          </p>
        </div>
        <button
          type="button"
          className="btn btn-primary btn-sm"
          disabled={!isOwner || mutation.isPending}
          title={
            isOwner ? undefined : "Requires organization owner permissions"
          }
          onClick={() => {
            if (!mutation.isPending) void runRerun(() => mutation.mutateAsync())
          }}
        >
          {mutation.isPending ? (
            <>
              <span className="loading loading-spinner loading-sm" />
              Re-running…
            </>
          ) : (
            "Re-run setup"
          )}
        </button>
      </div>

      {!isOwner && (
        <div className="mt-4 rounded-lg border border-warning/30 bg-warning/10 p-3 text-sm text-base-content/70">
          Re-running setup requires organization owner permissions. Ask an org
          owner to run it.
        </div>
      )}

      {started && (
        <div className="mt-4">
          <InitStepBoard steps={steps} />
        </div>
      )}
    </section>
  )
}

export default RerunOnboarding
