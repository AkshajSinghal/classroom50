import { AlertCircle, AlertTriangle, CheckCircle } from "lucide-react"

import type { InitStepId, InitStepUpdate } from "@/hooks/github/mutations"

// Shared init "badge board" used by both the onboarding wizard (OrgSetupPage)
// and the re-run action on the Org Settings page. One source of truth for the
// step order, titles, and per-step rendering so the two surfaces can't drift.

export const INIT_STEP_ORDER: InitStepId[] = [
  "orgDefaults",
  "orgActions",
  "orgPrCreation",
  "configRepo",
  "skeleton",
  "branchProtection",
  "workflowPermissions",
  "reusableWorkflowAccess",
  "pages",
  "rulesets",
]

export const initialInitSteps: Record<InitStepId, InitStepUpdate> = {
  orgDefaults: {
    id: "orgDefaults",
    status: "pending",
    title: "Organization safety defaults",
  },
  orgActions: { id: "orgActions", status: "pending", title: "Actions permissions" },
  orgPrCreation: {
    id: "orgPrCreation",
    status: "pending",
    title: "Actions pull request creation",
  },
  configRepo: { id: "configRepo", status: "pending", title: "Config repository" },
  skeleton: { id: "skeleton", status: "pending", title: "Skeleton files" },
  branchProtection: {
    id: "branchProtection",
    status: "pending",
    title: "Branch protection",
  },
  workflowPermissions: {
    id: "workflowPermissions",
    status: "pending",
    title: "Workflow permissions",
  },
  reusableWorkflowAccess: {
    id: "reusableWorkflowAccess",
    status: "pending",
    title: "Reusable workflow access",
  },
  pages: { id: "pages", status: "pending", title: "GitHub Pages" },
  rulesets: {
    id: "rulesets",
    status: "pending",
    title: "Branch protection rulesets",
  },
}

export function applyStepUpdate(
  steps: Record<InitStepId, InitStepUpdate>,
  update: InitStepUpdate,
): Record<InitStepId, InitStepUpdate> {
  return {
    ...steps,
    [update.id]: {
      ...steps[update.id],
      ...update,
    },
  }
}

export const InitStep = ({
  title,
  description,
  status,
  message,
}: {
  title: string
  description?: string
  status: "pending" | "running" | "complete" | "warning" | "error" | "skipped"
  message?: string
}) => {
  const badgeClass =
    status === "complete"
      ? "badge-success"
      : status === "warning"
        ? "badge-warning"
        : status === "error"
          ? "badge-error"
          : "badge-neutral badge-ghost"

  return (
    <div className="flex items-start justify-between gap-4 rounded-xl border border-base-300 bg-base-100 p-4">
      <div>
        <div className="font-semibold">{title}</div>
        <p className="mt-1 text-sm text-base-content/70">
          {message || description}
        </p>
      </div>
      <span className={`badge ${badgeClass}`}>
        {status === "complete" ? <CheckCircle className="size-4" /> : <></>}
        {status === "warning" ? <AlertCircle className="size-4" /> : <></>}
        {status === "running" ? (
          <span className="loading loading-spinner size-4" />
        ) : (
          <></>
        )}
        {status === "error" ? <AlertTriangle className="size-4" /> : <></>}
      </span>
    </div>
  )
}

export const InitStepBoard = ({
  steps,
}: {
  steps: Record<InitStepId, InitStepUpdate>
}) => (
  <div className="grid gap-3">
    {INIT_STEP_ORDER.map((id) => {
      const step = steps[id]
      return (
        <InitStep
          key={step.id}
          title={step.title ?? step.id}
          status={step.status}
          description={step.message ?? step.error}
        />
      )
    })}
  </div>
)
