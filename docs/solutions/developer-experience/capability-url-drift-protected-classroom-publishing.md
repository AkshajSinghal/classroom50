---
title: "Capability-URL path drift between the web app and the Pages publisher for protected classrooms"
date: 2026-06-28
problem_type: developer_experience
track: knowledge
category: developer-experience
module: publishing
component: tooling
severity: high
related_components:
  - "src/util/secret.ts (classroomPagesSegment invariant)"
  - "src/pages/AcceptAssignmentPage.tsx (ambiguous not-found error)"
  - "foundation50/classroom50-cli (secret.go; generated publish-pages.yaml workflow)"
tags:
  - github-pages
  - capability-url
  - cross-repo-drift
  - protected-classroom
  - error-disambiguation
  - config-refresh
applies_when: "A client-side app and a separately-generated publisher (CLI / GitHub Actions workflow) must agree on a shared path/URL invariant, the published artifacts live on GitHub Pages, and orgs hold stale generated config with no refresh or drift-detection signal"
symptoms:
  - 'Student accept link shows "Assignment not found" though the assignment exists'
  - "Pages fetch of <classroom>/<secret>/assignments.json returns 404 while <classroom>/assignments.json returns 200"
  - "Protected classroom (classroom.json has a secret) but content published to the plain guessable path"
  - "A Pages-fetch 404 and a genuinely-missing slug collapse into the same not-found screen"
root_cause: config_error
resolution_type: config_change
related_docs:
  - "docs/solutions/architecture-patterns/serverless-github-identity-reconciliation.md (cross-binary data contract; §5)"
---

# Capability-URL path drift between the web app and the Pages publisher for protected classrooms

## Context

A student "accept assignment" link rendered **"Assignment not found"** even though the assignment genuinely existed:

```
http://localhost:5173/classroom50-test-colton/introduction-to-computer-science/assignments/hello-assignment/accept?k=lak62eib
```

`classroom50-web` is a 100% client-side app over GitHub (no backend; see the
serverless identity-reconciliation learning). The accept page decides whether
an assignment exists by fetching a **public GitHub Pages** index
(`assignments.json`) and doing a client-side `find(a => a.slug === assignment)`.

For a **protected classroom** — one whose `classroom.json` carries a `secret`
— published Pages resources must live under a **capability path**
`<classroom>/<secret>/...` rather than the guessable `<classroom>/...`. That
invariant is centralized in `src/util/secret.ts` (`classroomPagesSegment`) and
is meant to be kept "in lockstep" with the CLI's `secret.go`.

Direct verification against Pages pinned the cause:

| URL the web app fetched (protected, correct)                             | Where the data actually was                                                                  |
| ------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------- |
| `…/introduction-to-computer-science/lak62eib/assignments.json` → **404** | `…/introduction-to-computer-science/assignments.json` → **200, contains `hello-assignment`** |

`classroom.json` confirmed `"secret": "lak62eib"`, so the classroom _was_
protected and the web app _correctly_ fetched the secret path. The **publisher**
— the org's generated `publish-pages.yaml` GitHub Actions workflow, almost
certainly an older version predating capability-URL support — wrote the index
to the plain path instead. The two sides of the invariant had drifted.

## Guidance

1. **When a shared path/URL invariant lives in two independently-deployed places, expect drift and design a detectable signal for it.** Here the web app honored its half (`classroomPagesSegment`) while an org's _generated, checked-in_ workflow files held a stale half. A shared constant or "kept in lockstep" comment only holds when both sides ship together; generated org artifacts are a third copy that lags arbitrarily. Stamp a config/workflow **version** into the published artifact (e.g. `classroom.json`) that the web app can compare against, and surface a "your org config is out of date" banner on mismatch.

2. **Provide a first-class "refresh this org's generated config + workflows" action.** A correct, intentional teacher action (enabling a protected classroom) silently produced a broken student link because there was no obvious way to regenerate and re-commit the org's workflow files after the generator changed. The remediation ("reconfigure the org to refresh the workflow files, then republish") must be a discoverable operation, not tribal knowledge.

3. **Do not collapse distinct failure modes into one user-facing error.** A Pages-fetch **404** (`assignmentsData` is `undefined`) and a **genuinely-missing slug** (index loaded fine, no matching entry) both fall through to the same `!assignmentData → "Assignment not found"` screen in `AcceptAssignmentPage.tsx`. The screen even says "the assignment may not have been published yet" when the truth was "published to the wrong path." Surface "couldn't load the classroom index (it may not be published at the expected secret path)" separately from "this slug isn't in the index."

4. **For capability URLs, add a preflight self-check.** Because the protected path is unguessable and there is no backend, nothing proactively verifies that `…/<secret>/assignments.json` resolves. The moment a protected classroom is enabled, fetch the _exact_ path the accept link will use and report success/failure — otherwise the system looks green everywhere and is still broken until a real student hits the dead link.

## Why This Matters

The bug was **not** in the web app — its code was correct. The expensive part
was diagnosis, and two design choices inflated it:

- **The error message lied about the cause.** Conflating a 404 with a missing
  slug sent the investigation toward "the assignment was never created / not
  published yet" when it had been created and published — just to the wrong
  path. Distinct causes sharing one message cost the most time.
- **Drift was invisible until a real student hit it.** No version stamp, no
  preflight, no refresh affordance meant the only signal was a dead link
  reported by a user. The capability-URL design (the URL _is_ the credential,
  no server to validate against) makes this worse: unguessable paths can't be
  spot-checked by guessing.

## When to Apply

- A client-side app and a separately-generated publisher (CLI / GitHub Actions
  workflow) must agree on a shared path or URL invariant.
- Published artifacts live on GitHub Pages (or any static host) where a wrong
  path is a silent 404, not a loud error.
- Orgs hold **generated, checked-in** config/workflow files that can lag the
  generator with no version or drift signal.
- A capability URL (secret-in-path) selects which resource is fetched, so a
  wrong/stale secret silently fetches a non-existent path.

## Examples

**Disambiguate the error (sketch) — separate a load failure from a real miss:**

```tsx
// BEFORE — both a 404 fetch and a missing slug render the same screen:
const assignmentData = assignmentsData?.find((a) => a.slug === assignment)
if (!assignmentData) {
  return <AssignmentNotFound user={user} assignment={assignment} />
}

// AFTER — surface the load failure (likely a secret-path/publish problem)
// distinctly from a genuinely-absent slug:
if (assignmentsError) {
  return <ClassroomIndexUnavailable error={assignmentsError} /> // "couldn't load the index at the expected (secret) path"
}
const assignmentData = assignmentsData?.find((a) => a.slug === assignment)
if (!assignmentData) {
  return <AssignmentNotFound user={user} assignment={assignment} /> // index loaded, slug truly absent
}
```

**Diagnosing capability-path drift from the outside — what actually pinned it:**

```bash
# Protected path the web app fetches (secret from classroom.json):
curl -so /dev/null -w '%{http_code}\n' \
  https://<org>.github.io/classroom50/<classroom>/<secret>/assignments.json   # 404 -> drift

# Plain path the stale publisher wrote to:
curl -s https://<org>.github.io/classroom50/<classroom>/assignments.json | grep '"slug"'  # 200, slug present

# Confirm the classroom really is protected:
curl -s https://<org>.github.io/classroom50/<classroom>/classroom.json | grep '"secret"'
```

If the plain path serves the index and the secret path 404s while
`classroom.json` has a `secret`, the publisher is the stale half of the
invariant — republish with a capability-URL-aware workflow.

## Related

- `docs/solutions/architecture-patterns/serverless-github-identity-reconciliation.md` — §5 ("The CSV is a cross-binary data contract — coordinate schema changes") is the same lesson in a different guise: state shared across independently-deployed tools drifts silently unless changed together. This learning extends it from a _data_ contract (`students.csv`) to a _path/URL_ contract (the capability path) and adds the missing-refresh-mechanism + collapsed-error angles.
- `docs/solutions/architecture-patterns/forward-only-cross-binary-repo-name-contract.md` — the third member of the cross-binary-contract family: a shared _name_ formula (`studentRepoName`) over-matched because it was reverse-parsed instead of forward-constructed. Same root family (shared formula across binaries), different failure (over-match vs path drift).
