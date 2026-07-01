// Org-plan eligibility for Classroom 50. GitHub's GET /orgs/{org} only returns
// `plan` to org owners; a non-owner member gets a response without it, so the
// plan name is often absent (unknown). Team/Enterprise are the plans Classroom
// 50 can be set up on; free can't. Unknown must never be treated as free — we'd
// hide/demote orgs the user can actually work with.

export type PlanCategory = "supported" | "free" | "unknown"

export function classifyPlan(name?: string): PlanCategory {
  if (name === "team" || name === "enterprise") return "supported"
  if (name === "free") return "free"
  return "unknown"
}

// Sort weight for the "Set Up" list: supported orgs bubble to the top, unknown
// in the middle (never demoted below free), free last.
export function planSortWeight(category: PlanCategory): number {
  switch (category) {
    case "supported":
      return 0
    case "unknown":
      return 1
    case "free":
      return 2
  }
}
