import { Link } from "@tanstack/react-router"
import { XCircle } from "lucide-react"

import useGetServiceTokenStatus from "@/hooks/useGetServiceTokenStatus"
import useGetOrgAudit from "@/hooks/useGetOrgAudit"
import useGetOrgPlanDetails from "@/hooks/useGetOrgPlanDetails"

// Teacher preflight banner shown when an org is opened. The service-token and
// policy checks live HERE (one org at a time) rather than on the org list,
// which would fan out these reads across every org the user can see.
//
// One aggregated "preflight check" banner names every failing category rather
// than surfacing them one at a time; the org settings page is the source of
// truth for the per-item detail. Every category here is a hard failure (a
// missing token or any policy drift), so the banner is always an error.
// Renders nothing while loading or when all checks pass.
const OrgPreflightNotice = ({ org }: { org: string }) => {
  const { data: tokenStatus, isPending: tokenPending } =
    useGetServiceTokenStatus(org)
  const { data: planDetails, isPending: planPending } =
    useGetOrgPlanDetails(org)
  const { data: audit, isPending: auditPending } = useGetOrgAudit(
    org,
    planDetails?.plan.name,
  )

  // Both checks resolve at different times. Rendering before all of them
  // settle makes the banner rewrite itself mid-flight ("An issue was found…" →
  // "Issues were found…"), so stay invisible until everything is known. We
  // render nothing (not a spinner) while checking: a healthy org should never
  // flash a placeholder — the banner only ever appears in its final state when
  // there's an actual problem. The audit query stays pending until the plan
  // loads (it's gated on it), so auditPending also covers the plan dependency;
  // planPending is included for the brief window before the audit is enabled.
  const checking = tokenPending || planPending || auditPending

  if (checking) return null

  const tokenMissing = tokenStatus?.status === "missing"
  const policyFail = audit?.verdict === "fail"

  // Each failing check contributes a named category. Both current categories are
  // hard failures (a missing token or any policy drift), so the banner is always
  // an error; it just names every failing category at once.
  const failing: string[] = []
  if (tokenMissing) failing.push("service token")
  if (policyFail) failing.push("organization policy")

  if (failing.length === 0) return null

  const categories = failing.join(", ")

  return (
    <div role="alert" className="alert alert-error alert-soft mb-6">
      <XCircle className="size-5" />
      <div className="text-sm">
        <p className="font-semibold">Organization preflight check failed</p>
        <p className="mt-0.5 text-base-content/70">
          {failing.length === 1
            ? `An issue was found with this organization's ${categories}.`
            : `Issues were found with this organization's ${categories}.`}{" "}
          Review and fix on the{" "}
          <Link to="/$org/settings" params={{ org }} className="link">
            organization settings page
          </Link>
          .
        </p>
      </div>
    </div>
  )
}

export default OrgPreflightNotice
