import { createFileRoute } from "@tanstack/react-router"
import { GitHubAuthCard } from "@/auth/GitHubAuthCard"

export const Route = createFileRoute("/login")({
  component: GitHubAuthCard,
})
