import { Link } from "@tanstack/react-router"
import { AlertTriangle, XCircle } from "lucide-react"

import useGetServiceTokenStatus from "@/hooks/useGetServiceTokenStatus"
import useGetOrgAudit from "@/hooks/useGetOrgAudit"
import useGetOrgPlanDetails from "@/hooks/useGetOrgPlanDetails"

// Teacher preflight banner shown when an org is opened. The service-token and
// policy checks live HERE (one org at a time) rather than on the org list,
// which would fan out these reads across every org the user can see. Renders
// nothing while loading or when everything is in order.
const OrgPreflightNotice = ({ org }: { org: string }) => {
  const { data: tokenStatus } = useGetServiceTokenStatus(org)
  const { data: planDetails } = useGetOrgPlanDetails(org)
  const { data: audit } = useGetOrgAudit(org, planDetails?.plan.name)

  const tokenMissing = tokenStatus?.status === "missing"
  const policyFail = audit?.verdict === "fail"
  const policyWarn = audit?.verdict === "warn"

  if (!tokenMissing && !policyFail && !policyWarn) return null

  const isError = tokenMissing || policyFail

  return (
    <div
      role="alert"
      className={`alert ${isError ? "alert-error" : "alert-warning"} alert-soft mb-6`}
    >
      {isError ? (
        <XCircle className="size-5" />
      ) : (
        <AlertTriangle className="size-5" />
      )}
      <div className="text-sm">
        <p className="font-semibold">
          {tokenMissing
            ? "This organization needs a service token"
            : policyFail
              ? "Organization policy is incomplete"
              : "Organization policy has drifted"}
        </p>
        <p className="mt-0.5 text-base-content/70">
          {tokenMissing
            ? "Classroom 50 workflows can't run until a service token is set."
            : "Some organization settings differ from the Classroom 50 lockdown."}{" "}
          Review it on the{" "}
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
