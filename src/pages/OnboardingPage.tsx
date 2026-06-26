import {
  AlertTriangle,
  CheckCircle2,
  GraduationCap,
  Loader2,
  Mail,
  UserPlus,
} from "lucide-react"
import GitHub from "@/assets/github.svg?react"
import { Link, useParams, useSearch } from "@tanstack/react-router"
import { useMutation } from "@tanstack/react-query"
import { useState } from "react"
import { useGitHubClient } from "@/context/github/GitHubProvider"
import { useGithubAuth } from "@/auth/useGithubAuth"
import useGetOwnOrgMembership from "@/hooks/useGetOwnOrgMembership"
import { submitOnboarding } from "@/api/mutations/onboarding"
import { isValidEmail } from "@/util/onboarding"

const OnboardNavbar = () => (
  <div className="navbar bg-base-100 shadow-sm">
    <Link to="/">
      <div className="flex p-6 text-lg font-bold">
        <GraduationCap className="size-8 text-[#accefb] mr-2" /> Classroom 50
      </div>
    </Link>
  </div>
)

const OnboardCard = ({ children }: { children: React.ReactNode }) => (
  <div className="card w-200 max-w-[calc(100vw-2em)] p-8 m-auto rounded-xl mt-10 border border-[#eee]">
    {children}
  </div>
)

const NotOrgMember = ({
  org,
  classroom,
}: {
  org?: string
  classroom?: string
}) => (
  <div className="min-h-screen bg-base-100">
    <OnboardNavbar />
    <OnboardCard>
      <div className="card-body gap-6">
        <div>
          <span className="badge badge-error badge-soft gap-2">
            <AlertTriangle className="size-4" />
            Access Denied
          </span>
          <h1 className="mt-6 text-2xl font-bold">Not an org member yet</h1>
          <p className="mt-2 text-base text-base-content/70">
            You are not currently a member of the{" "}
            <span className="font-bold">{org}</span> organization.
          </p>
        </div>

        <div className="rounded-2xl border border-info/20 bg-info/5 p-5">
          <div className="flex gap-3">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-info/10 text-info">
              <UserPlus className="size-5" />
            </div>
            <div className="min-w-0">
              <h2 className="font-semibold text-base-content">
                Accept your invitation first
              </h2>
              <p className="mt-2 leading-5 text-sm text-base-content/70">
                Your instructor invited you to the{" "}
                <span className="font-semibold text-base-content">{org}</span>{" "}
                GitHub organization for{" "}
                <span className="font-semibold text-base-content">
                  {classroom}
                </span>
                . Check your email for the GitHub invitation and accept it.
              </p>
              <p className="mt-3 text-xs leading-5 text-base-content/60">
                After accepting the GitHub organization invitation, return to
                this page and refresh.
              </p>
            </div>
          </div>
        </div>
      </div>
    </OnboardCard>
  </div>
)

const OnboardingPage = () => {
  const { org, classroom } = useParams({ strict: false })
  // The invited email may travel in the link as a prefill (an individual link
  // the teacher sent). On the generic classroom-wide link it's absent and the
  // student types it. Either way it's an untrusted value: it only seeds the
  // deterministic repo name + claimed-email field; the authenticated session is
  // what actually authorizes everything, and reconciliation re-verifies the
  // commit author against the claimed identity.
  const search = useSearch({ strict: false }) as { email?: string }
  const prefilledEmail = typeof search.email === "string" ? search.email : ""
  const [email, setEmail] = useState(prefilledEmail)
  const client = useGitHubClient()

  const { user } = useGithubAuth()
  const { data: orgMembership, isLoading: loadingMembership } =
    useGetOwnOrgMembership(org)

  const emailValid = isValidEmail(email)

  const onboardMutation = useMutation({
    mutationFn: () =>
      submitOnboarding(client, {
        org: org ?? "",
        classroom: classroom ?? "",
        email: email.trim(),
      }),
  })

  if (loadingMembership) {
    return (
      <div className="min-h-screen bg-base-100">
        <OnboardNavbar />
        <OnboardCard>
          <div className="loading loading-spinner loading-xl text-center m-auto" />
        </OnboardCard>
      </div>
    )
  }

  if (!orgMembership) {
    return <NotOrgMember org={org} classroom={classroom} />
  }

  const done = onboardMutation.isSuccess

  return (
    <div className="min-h-screen bg-base-100">
      <OnboardNavbar />
      <OnboardCard>
        <div className="card-body gap-6">
          <div>
            <span className="badge badge-primary badge-soft gap-2">
              <Mail className="size-4" />
              Onboarding
            </span>
            <h1 className="mt-6 text-2xl font-bold">Confirm your enrollment</h1>
            <p className="mt-2 text-base text-base-content/70">
              This links your GitHub account to your instructor&apos;s class
              roster for{" "}
              <span className="font-semibold text-base-content">
                {classroom}
              </span>
              .
            </p>
          </div>

          <div className="flex gap-4 bg-[#fafafa] p-4 rounded-xl border border-[#ddd]">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1 text-sm text-base-content/60">
                <GitHub className="size-4" />
                <span>{user?.login ?? "Checking GitHub user..."}</span>
              </div>
            </div>
          </div>

          <div>
            <label
              htmlFor="onboard-email"
              className="text-sm font-medium text-base-content"
            >
              Your university email
            </label>
            <p className="mt-1 text-xs text-base-content/60">
              Enter the email your instructor used to invite you, so they can
              match you to the class roster.
            </p>
            <div className="mt-2 flex">
              <Mail className="size-6 mr-2 text-[#bbb]" />
              <input
                id="onboard-email"
                type="email"
                value={email}
                placeholder="student@university.edu"
                className="input w-full"
                disabled={done || onboardMutation.isPending}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            {email && !emailValid && (
              <p className="text-error text-sm mt-1">
                Enter a valid email address.
              </p>
            )}
          </div>

          {onboardMutation.isError && (
            <div className="alert alert-error alert-soft text-sm">
              {onboardMutation.error instanceof Error
                ? onboardMutation.error.message
                : "Something went wrong. Please try again."}
            </div>
          )}

          {done ? (
            <div className="rounded-2xl border border-success/20 bg-success/5 p-5">
              <div className="flex gap-3">
                <CheckCircle2 className="size-6 shrink-0 text-success" />
                <div>
                  <h2 className="font-semibold text-base-content">
                    You&apos;re all set
                  </h2>
                  <p className="mt-1 text-sm text-base-content/70">
                    Your instructor will see you on the roster shortly. You can
                    now accept assignments shared with you.
                  </p>
                </div>
              </div>
            </div>
          ) : (
            <button
              type="button"
              className="btn btn-primary w-full bg-[#4e80ee]"
              disabled={onboardMutation.isPending || !emailValid}
              onClick={() => onboardMutation.mutate()}
            >
              {onboardMutation.isPending ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  Confirming...
                </>
              ) : (
                "Confirm enrollment"
              )}
            </button>
          )}
        </div>
      </OnboardCard>
    </div>
  )
}

export default OnboardingPage
