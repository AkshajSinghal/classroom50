---
title: "Derive membership by forward-constructing shared names, not by reverse-parsing them"
date: 2026-06-28
problem_type: architecture_pattern
track: knowledge
category: architecture-patterns
module: submissions
component: "assignment acceptance derivation (studentRepoName)"
tags:
  - cross-binary-contract
  - repo-naming
  - reverse-parsing
  - shared-formula
  - github-api
  - prefix-collision
applies_when: "A name or path is built by a formula shared across more than one tool/binary, and you need to derive which entities exist from a list of those names"
related_repos:
  - "foundation50/classroom50-cli (shares the studentRepoName formula and students.csv schema)"
related_docs:
  - "docs/solutions/architecture-patterns/serverless-github-identity-reconciliation.md (§3 name-is-an-address-not-a-match-key; §5 cross-binary data contract)"
  - "docs/solutions/developer-experience/capability-url-drift-protected-classroom-publishing.md (sibling cross-binary shared-formula failure: path drift vs name over-match)"
---

# Derive membership by forward-constructing shared names, not by reverse-parsing them

## Context

The assignment overview dashboard (#59) needed to show which students had "accepted" an assignment. In `classroom50-web` — a 100% client-side app over GitHub with no backend — there is no acceptance event to query; acceptance is _implicit_: **a student's repo exists in the org**. Student repos are named by a single shared formula, `studentRepoName(classroom, assignment, owner)` = `<classroom>-<assignment>-<owner>` (lowercased), defined in `src/util/studentRepo.ts` and treated as the single source of truth across three binaries — the web app, the `gh-teacher` Go CLI, and the autograder.

So the dashboard had a list of org repos and a roster, and needed to derive "which roster usernames have a repo for this assignment." The obvious-but-wrong instinct is to read the answer _out of_ the repo names by stripping a known prefix. That instinct inverts the shared formula — and a re-implemented inverse drifts from the forward formula on edge cases the formula's authors never intended it to encode.

## Guidance

**When membership is encoded by a shared, forward-constructed name, derive membership by FORWARD-constructing the expected name and testing existence — never by reverse-parsing or prefix-stripping arbitrary names.**

The reverse-parse approach builds a prefix `<classroom>-<assignment>-` and, for every org repo whose name `startsWith(prefix)`, strips the prefix to recover an owner:

```ts
// BAD — reverse-parse: re-implements the inverse of the shared formula
const prefix = studentRepoName(classroom, assignment, "") // "cs-hw-"
for (const repo of repos) {
  const name = repo.name.toLowerCase()
  if (name.startsWith(prefix) && name.length > prefix.length) {
    accepted.add(name.slice(prefix.length)) // "owner"
  }
}
```

This breaks via **prefix bleed**: when a sibling assignment's slug _extends_ this assignment's slug, the prefix over-matches. Classroom `cs` + assignment `hw` -> prefix `cs-hw-`. The repo `cs-hw-bonus-alice` (which belongs to assignment `hw-bonus`) passes `startsWith('cs-hw-')`, so the code emits a bogus owner `bonus-alice`. GitHub Classroom slugs routinely share prefixes (`project` vs `project-final`, `lab1` vs `lab1-extra`). The trailing `-` only guards the _immediate_ token boundary — it correctly stops `hw1` from matching `hw10` — but it does nothing against a real sibling slug that legitimately begins with this slug plus a separator.

The fix iterates the **roster** and forward-constructs each student's exact expected name, testing it against a `Set` of org repo names:

```ts
// GOOD — forward-construct + existence check: uses the shared formula one direction only
const repoNames = new Set(repos.map((r) => r.name.toLowerCase()))
for (const student of students) {
  if (repoNames.has(studentRepoName(classroom, assignment, student.username))) {
    accepted.add(student.username.toLowerCase())
  }
}
```

Now the derived set can only ever contain real roster usernames that have a real repo — there is no parsing step that can fabricate an owner, so there is no bleed. The shared formula is used in exactly **one** direction (construction), so there is no second, drift-prone inverse to maintain.

Lock the boundary behavior in with regression tests: `hw` must NOT capture `cs-hw-bonus-alice`, and `hw1` must NOT capture `cs-hw10-alice`.

## Why This Matters

The repo-name formula is a **cross-binary contract** shared by the web app, the `gh-teacher` CLI, and the autograder. Reverse-parsing doesn't just have a local bug — it secretly forks the contract: it re-implements the _inverse_ of a formula whose only authoritative definition is the forward direction, and that inverse accretes its own edge cases (the trailing-`-` guard) that can silently disagree with how the other binaries construct names. The formula's authors never promised it was uniquely invertible across sibling slugs, because forward construction never needs that property.

The downstream cost was concrete and user-visible. The polluted accepted-set fed a profile modal whose "Open repo" link rebuilt the repo URL from the fabricated/roster username — producing a **404** for a student who looked "accepted" in the dashboard. A parsing error in one widget leaked into a broken link in another.

This is the same lesson as `serverless-github-identity-reconciliation.md` §3 — _"the artifact name is a read/delete address, NOT a match key"_ — where onboarding deliberately matches by **content** rather than recomputing the unguessable name. Here the name _is_ derivable, so the matching key is the **forward-constructed exact name**, never a back-parse of arbitrary names. It is also the §5 cross-binary-contract lesson (and the path-contract variant in `capability-url-drift-protected-classroom-publishing.md`): state shared across independently-shipped tools drifts unless you touch the shared definition in exactly one, agreed direction. Together these form a "cross-binary contract" trio — a **data** contract (`students.csv`), a **path** contract (the capability URL), and a **name** contract (`studentRepoName`) — the same family in three guises.

## When to Apply

- A name or path is built by a **shared formula** used by more than one tool/binary (`<a>-<b>-<owner>`, `<classroom>/<secret>/...`, any templated key), and you need to know _which_ entities exist.
- You are tempted to recover a field by `startsWith(prefix)` + `slice`, splitting on a delimiter, or otherwise reverse-engineering a constructed name back into its parts.
- The variable component (slug, owner, assignment) can **share a prefix** with a sibling — which for human-chosen slugs is the common case, not the exception.
- You have an authoritative list of the candidate keys (a roster, a set of usernames, a list of valid slugs) you could instead iterate and forward-construct.

If you have that authoritative list, prefer: build a `Set` of the real names once, then for each known key test `set.has(forwardConstruct(key))`. Reserve any parsing for cases where the variable component is genuinely unrecoverable from a list (and then match by content, per §3 of the identity-reconciliation doc — don't recompute the name at all).

## Examples

**The shared formula (the single source of truth, used forward only):**

```ts
// src/util/studentRepo.ts — the cross-binary formula, same as the CLI and
// `gh student accept`. Shared with the Go CLI as the single source of truth.
export const studentRepoName = (
  classroom: string,
  assignment: string,
  owner: string,
): string => `${classroom}-${assignment}-${owner}`.toLowerCase()
```

**Before vs after (the core inversion):**

```ts
// BEFORE — reverse-parse: prefix bleed fabricates owners from sibling slugs.
// classroom "cs" + assignment "hw" -> prefix "cs-hw-"
// repo "cs-hw-bonus-alice" (assignment "hw-bonus") -> bogus owner "bonus-alice"
const prefix = studentRepoName(classroom, assignment, "")
for (const repo of repos) {
  const name = repo.name.toLowerCase()
  if (name.startsWith(prefix) && name.length > prefix.length) {
    accepted.add(name.slice(prefix.length))
  }
}

// AFTER — forward-construct each roster entry's exact name and test existence.
// Only real roster usernames with a real repo can enter the set. No bleed.
const repoNames = new Set(repos.map((r) => r.name.toLowerCase()))
for (const student of students) {
  if (repoNames.has(studentRepoName(classroom, assignment, student.username))) {
    accepted.add(student.username.toLowerCase())
  }
}
```

**Regression tests that pin the boundary (prefix-bleed + adjacent-token):**

```ts
// A sibling slug that EXTENDS this one must not be captured:
//   classroom "cs", assignment "hw"  must NOT match  "cs-hw-bonus-alice"
// An adjacent token must not be captured either:
//   classroom "cs", assignment "hw1" must NOT match  "cs-hw10-alice"
expect([
  ...acceptedUsernames(["cs-hw-bonus-alice"], "cs", "hw", roster),
]).not.toContain("alice")
expect(acceptedUsernames(["cs-hw10-alice"], "cs", "hw1", roster).size).toBe(0)
```

**Generalizable rule:** when a name or path is constructed by a shared formula across tools, derive membership by **forward-constructing the expected name and testing existence** — never by reverse-parsing or prefix-stripping arbitrary names. The forward formula is the contract; its inverse is a second implementation you didn't agree to maintain.

## Related

- `docs/solutions/architecture-patterns/serverless-github-identity-reconciliation.md` — §3 ("the artifact name is a read/delete address, NOT a match key") is the conceptual parent of this learning; §5 states the cross-binary data-contract rule for `students.csv`. There the name is unguessable so matching is by content; here the name is derivable so matching is by forward-constructed exact name — same principle, opposite derivability.
- `docs/solutions/developer-experience/capability-url-drift-protected-classroom-publishing.md` — the sibling failure mode in the same family: a shared path formula drifting between independently-deployed tools, rather than an over-greedy reverse parse of a shared name formula.
