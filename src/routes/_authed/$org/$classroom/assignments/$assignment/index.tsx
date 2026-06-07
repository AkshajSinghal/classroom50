import { createFileRoute } from "@tanstack/react-router"
import SubmissionsPage from "@/pages/SubmissionsPage"

export const Route = createFileRoute(
  "/_authed/$org/$classroom/assignments/$assignment/",
)({
  component: SubmissionsPage,
})
