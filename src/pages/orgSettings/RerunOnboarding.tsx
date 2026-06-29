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
import SettingsSection from "./SettingsSection"

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
    <SettingsSection
      title="Re-run setup"
      description="Re-apply every Classroom 50 organization setting. Safe to run any time — it only changes settings that have drifted."
      action={
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
      }
    >
      {!isOwner && (
        <div className="rounded-lg border border-warning/30 bg-warning/10 p-3 text-sm text-base-content/70">
          Re-running setup requires organization owner permissions. Ask an org
          owner to run it.
        </div>
      )}

      {started && (
        <div className={!isOwner ? "mt-4" : undefined}>
          <InitStepBoard steps={steps} />
        </div>
      )}
    </SettingsSection>
  )
}

export default RerunOnboarding
