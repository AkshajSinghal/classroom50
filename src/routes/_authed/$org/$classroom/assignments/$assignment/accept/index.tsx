import { createFileRoute } from "@tanstack/react-router"
import AcceptAssignmentPage from "@/pages/AcceptAssignmentPage"

// `k` is the optional capability-URL access key for a classroom with
// protected resources. It travels in the accept link the teacher shares
// (the URL is the credential) rather than being read from the private
// config repo, which students can't access.
export const Route = createFileRoute(
  "/_authed/$org/$classroom/assignments/$assignment/accept/",
)({
  validateSearch: (search: Record<string, unknown>): { k?: string } => ({
    k: typeof search.k === "string" ? search.k : undefined,
  }),
  component: AcceptAssignmentPage,
})
