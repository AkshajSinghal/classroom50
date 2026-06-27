---
title: "Roster rows flash in the wrong section during staggered query loads"
date: 2026-06-27
category: ui-bugs
module: students-roster
problem_type: ui_bug
component: rails_view
symptoms:
  - 'An onboarded student briefly appears under "Awaiting enrollment" then jumps to "Ready for enrollment confirmation" as the page finishes loading'
  - "Roster sections render with rows in the wrong bucket before settling"
root_cause: async_timing
resolution_type: code_fix
severity: low
tags:
  - react-query
  - loading-state
  - onboarding
  - derived-state
  - flash-of-wrong-state
---

# Roster rows flash in the wrong section during staggered query loads

## Problem

On the teacher students page, a student who had already started onboarding (so an onboarding repo / self-report exists) briefly rendered under "Awaiting enrollment" and then jumped to "Ready for enrollment confirmation" as the page finished loading. The roster's section was derived from multiple independent queries that resolved at different times, and the loading guard didn't wait for all of them.

## Symptoms

- An onboarded student flashes in "Awaiting enrollment" for a moment, then moves to "Ready for enrollment confirmation".
- More generally, any row whose section depends on a still-pending query can render in the wrong bucket first.

## What Didn't Work

- The existing guard gated rendering on `statusLoading`, which only tracked the **members** and **invitations** queries. It did not include the **onboarding self-reports** query. The "ready vs awaiting" distinction is computed _from_ the self-reports, so once members/invitations resolved (but reports hadn't), an onboarded student was classified `onboarding` -> "Awaiting", then re-classified `ready` -> "Ready" when the reports query landed.
- Partitioning already correctly treated "reports not yet loaded" as `undefined` (so a row is never mislabeled "ready" prematurely) — but that safety meant the row fell through to "awaiting" in the meantime, which is exactly the wrong-section flash. Defaulting the other direction would instead flash rows as falsely "ready".

## Solution

Expose a single `rosterReady` flag from the shared `useRosterStatus` hook that is true only once **every** query the section partition depends on has settled, and hold the status-driven sections (and show a spinner) until then.

```ts
// useRosterStatus.ts — settle ALL partition inputs before declaring ready.
// "ready vs awaiting" needs the onboarding-reports query specifically; for a
// non-owner (status unavailable) reports aren't fetched, so don't wait on them.
const rosterReady =
  !statusLoading && (!statusAvailable || reportsLoaded || reportsErrored)
```

```tsx
// EnrolledStudents.tsx — gate the three status-driven sections on rosterReady.
{!rosterReady ? (
  <div className="card card-border w-full bg-base-100 shadow-sm">
    <div className="flex items-center justify-center gap-3 px-6 py-12 text-base-content/50">
      <span className="loading loading-spinner loading-md" />
      <span className="text-sm">Loading roster...</span>
    </div>
  </div>
) : null}

{rosterReady && readyToConfirm.length > 0 ? (/* Ready section */) : null}
{rosterReady && awaitingEnrollment.length > 0 ? (/* Awaiting section */) : null}
{rosterReady ? (/* Enrolled section */) : null}
```

The action-result banners and the "Invite students" card still render during load, so links stay available.

## Why This Works

The bug is a flash-of-wrong-state from **derived state computed over multiple async sources that resolve independently**. A loading guard for derived UI must cover _every_ input the derivation reads, not just the first one(s) to load. `statusLoading` covered two of the three inputs; the third (self-reports) is the one the "ready vs awaiting" split actually depends on, so omitting it guaranteed a transient misclassification. `rosterReady` makes the guard match the true dependency set, and the error/non-owner branches keep it from spinning forever (`reportsErrored` surfaces its own warning; a non-owner never fetches reports).

## Prevention

- When rendering UI derived from several React Query calls, gate on a flag that reflects **all** queries feeding the derivation — not a subset. Audit: "which queries does this classification read?" must equal "which queries does the loading guard wait on?"
- Centralize the derivation and its readiness flag in one hook (here `useRosterStatus`) so every consumer (the list and the header count) shares the same definition of "ready" and can't drift.
- Always give the readiness flag an escape hatch for error and not-applicable states (`reportsErrored`, `!statusAvailable`) so a failed/skipped query doesn't hang the UI on a spinner.

## Related Issues

- `docs/solutions/architecture-patterns/serverless-github-identity-reconciliation.md` — the reconciliation design that produces the self-reports this section is derived from (different concern: that doc is the identity-binding architecture; this is the UI loading-coordination bug).
