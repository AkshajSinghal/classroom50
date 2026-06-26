import { createFileRoute } from "@tanstack/react-router"
import OnboardingPage from "@/pages/OnboardingPage"

// `email` is the invited address, carried in the onboarding link the teacher
// shares. It is an UNTRUSTED prefill: it seeds the deterministic onboarding
// repo name and the claimed-email field, but the authenticated session is what
// authorizes everything. A non-string value degrades to no prefill.
export const Route = createFileRoute("/_authed/$org/$classroom/onboard/")({
  validateSearch: (search: Record<string, unknown>): { email?: string } => ({
    email: typeof search.email === "string" ? search.email : undefined,
  }),
  component: OnboardingPage,
})
