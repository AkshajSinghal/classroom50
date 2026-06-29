// Org teardown — the web mirror of the CLI's `gh teacher teardown` (delete
// every repo in the org, marker-gated, marker deleted last). Mirrors the CLI's
// scope decision (ALL org repos, not a leaky managed-only filter) and its
// safety model. Destructive and irreversible — the caller gates it behind a
// typed-org-name ConfirmModal.

import type { GitHubClient } from "@/hooks/github/client"
import { GitHubAPIError } from "@/hooks/github/errors"
import { deleteRepo } from "@/hooks/github/mutations"
import { getOrgRepos, getRepo } from "@/hooks/github/queries"
import { CONFIG_REPO } from "@/hooks/github/orgChecks"
import { mapWithConcurrency } from "@/util/concurrency"

export class TeardownScopeError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "TeardownScopeError"
  }
}

export class TeardownMarkerError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "TeardownMarkerError"
  }
}

export type TeardownPlan = {
  org: string
  repoNames: string[]
}

// Enumerate the deletion plan: every repo in the org, with the marker repo
// ordered last so an interrupted run leaves the marker behind (re-runnable).
// Refuses an org without the classroom50 marker repo.
export async function planTeardown(
  client: GitHubClient,
  org: string,
): Promise<TeardownPlan> {
  const marker = await getRepo(client, org, CONFIG_REPO)
  if (!marker) {
    throw new TeardownMarkerError(
      `${org}/${CONFIG_REPO} not found — refusing teardown on an org without the Classroom 50 marker repo.`,
    )
  }

  const repos = await getOrgRepos(client, org)
  const names = (repos ?? []).map((r) => r.name)
  const nonMarker = names.filter((n) => n !== CONFIG_REPO)
  // Marker last so a partial run stays re-runnable.
  return { org, repoNames: [...nonMarker, CONFIG_REPO] }
}

export type TeardownResult = {
  deleted: string[]
  failed: string[]
}

// Execute the teardown plan: delete each repo with bounded concurrency to
// respect secondary rate limits, marker last (the plan already orders it).
// A 403 on the first delete is the delete_repo scope wall — surfaced as an
// actionable TeardownScopeError rather than a silent partial wipe.
export async function executeTeardown(
  client: GitHubClient,
  plan: TeardownPlan,
): Promise<TeardownResult> {
  const deleted: string[] = []
  const failed: string[] = []

  // Delete non-marker repos with bounded concurrency, then the marker alone so
  // it is genuinely last regardless of scheduling.
  const nonMarker = plan.repoNames.filter((n) => n !== CONFIG_REPO)
  const marker = plan.repoNames.filter((n) => n === CONFIG_REPO)

  let scopeWall = false

  const tryDelete = async (repo: string) => {
    try {
      await deleteRepo(client, { owner: plan.org, repo })
      deleted.push(repo)
    } catch (err) {
      if (err instanceof GitHubAPIError && err.isForbidden) {
        scopeWall = true
      }
      failed.push(repo)
    }
  }

  await mapWithConcurrency(nonMarker, 4, tryDelete)

  if (scopeWall) {
    throw new TeardownScopeError(
      "Deleting repositories was forbidden (403). Teardown needs the `delete_repo` OAuth scope, which is not granted by default. Re-authenticate with that scope, or archive repositories instead.",
    )
  }

  // Marker last.
  for (const repo of marker) {
    await tryDelete(repo)
  }

  return { deleted, failed }
}
