import { createFileRoute } from "@tanstack/react-router"
import OnboardingPage from "@/pages/OnboardingPage"
import { isValidInviteToken } from "@/util/onboarding"

// `email` is the invited address, carried in the onboarding link the teacher
// shares. It is an UNTRUSTED prefill: it seeds the claimed-email field only,
// while the authenticated session is what authorizes everything. A non-string
// value degrades to no prefill.
//
// `t` is the optional secure-link invite token (the secure-link flow). It must
// be declared here so the validated search type matches what OnboardingPage
// reads — otherwise the page relies on TanStack's loose passthrough and a
// future strict-search change would silently drop the token, weakening
// reconcile's strongest match key. The token is written into the self-report
// YAML; it does not name the repo. A garbage value degrades to the
// classroom-wide flow (reconcile then matches by github_id, else email).
export const Route = createFileRoute("/_authed/$org/$classroom/onboard/")({
  validateSearch: (
    search: Record<string, unknown>,
  ): { email?: string; t?: string } => ({
    email: typeof search.email === "string" ? search.email : undefined,
    t:
      typeof search.t === "string" && isValidInviteToken(search.t)
        ? search.t
        : undefined,
  }),
  component: OnboardingPage,
})
