---
title: "Serverless GitHub identity reconciliation for classroom onboarding"
date: 2026-06-27
problem_type: architecture_decision
track: knowledge
category: architecture-patterns
module: onboarding
component: "students.csv reconcile + onboarding repos"
tags:
  - onboarding
  - github-api
  - reconciliation
  - serverless
  - identity
  - csv-schema
applies_when: "Building an onboarding/identity flow with no backend, where state lives entirely in GitHub (repos, org/team membership, a CSV roster) and a privileged actor must bind a self-reported identity to a roster row"
related_repos:
  - "foundation50/classroom50-cli (shares the students.csv schema; see issue #195)"
---

# Serverless GitHub identity reconciliation for classroom onboarding

## Context

Classroom50-web is a 100% client-side app on top of GitHub: no server, no
database. A teacher invites students, each student self-reports their GitHub
identity, and the teacher confirms ("enrolls") them into a `students.csv`
roster stored in a private `classroom50` config repo. The browser running as
the student CANNOT read that roster (it is private to the teacher), and the
browser running as the teacher only has the GitHub REST API to work with.

The hard part is binding a student's self-reported identity to the right roster
row safely, when the only shared, trustworthy primitives are GitHub repos, org
and team membership, commit authorship, and a CSV file. This learning captures
the pattern we converged on after several wrong turns, so the next
GitHub-backed onboarding/identity flow does not re-derive it.

## Guidance

### 1. Name the self-report artifact by a self-bound key; if the name is guessable, plan for squatting

Each student creates a private "onboarding repo" holding a
`.classroom50-onboarding.yaml` self-report (their claimed email + name; their
GitHub-attested `github_username`/`github_id`). We name it:

```
onboarding-<github-id>
```

one repo per student per org. The github-id segment makes the name derivable,
so both the student's own lookup and the teacher's reconcile can reconstruct it
exactly (and still list by the shared `onboarding-` prefix). This trades the
prior squat-proofing for a simpler, single-repo-per-student lifecycle.

The trade-off, made deliberately: because `github-id` is public, the full name
is **guessable**, so any org member can **pre-create / squat** `onboarding-<victimId>`.
That does NOT let them hijack the identity (the author check in §2 binds only
their own attested id), but it can lock the victim out — their create 422s and a
naive "re-fetch the existing repo and commit into it" then 403s, because they
can't push to a repo someone else owns. Two things keep the simpler name safe:

- **Detect the squat, don't fall into it.** On the 422, re-fetch the repo and
  check `permissions.push`; if you can't write, fail with an actionable "name
  already taken — ask your instructor to remove it" error instead of 403-ing
  deep inside the commit. (Never delete a repo you didn't create this call.)
- **Match exactly, not by prefix.** With a suffix-free name, `onboarding-42` is
  a string prefix of `onboarding-420`; the own-repo/cleanup lookups must compare
  the full name, not `startsWith`, or one student's repo leaks into another's
  resolution.

(The earlier design appended a 128-bit random suffix —
`classroom50-onboarding-<github-id>-<random-hash>` — to make the name
unguessable and per-attempt unique, which removed the squat vector entirely at
the cost of a non-derivable name. If you don't need the simpler lifecycle,
prefer the unguessable suffix: a guessable self-report-artifact name is a
denial-of-service surface you then have to defend explicitly.)

### 2. Trust the self-report only after a GitHub-attested author check

The YAML's `github_username`/`github_id` are written by the authenticated
student, but a teacher must still verify the writer IS who they claim. Read the
commit author/committer ids of the YAML file and require the claimed
`github_id` to be among them. This is what keeps a guessable name safe: a
squatter can only ever author commits as themselves, so they can only bind
their own attested id — never a victim's.

### 3. The artifact name is a read/delete address, NOT a match key

Even though the name is now derivable, reconciliation must NOT bind a repo to a
row by its name. The name attests nothing — anyone can create
`onboarding-<id>`, and the id in the name is unverified until the author check.
So keep the inversion: **list onboarding repos by the shared prefix, read each
YAML, verify the commit author, and match the payload back to a roster row by
content**, strongest key first:

1. `invite_token` (an always-minted, teacher-issued per-row secret written into
   the YAML when the student used a unique secure link) — unguessable, binds to
   the exact row.
2. `github_id` — immutable; binds a username-invited row.
3. `email` — last resort; the accepted-residual-risk path (the YAML email is
   attacker-controllable, so this is hardened: only match a row with no stronger
   key and a real email key, and route an ambiguous multi-match to `unmatched`
   (with a reason) rather than guessing).

Implement this precedence ONCE and share it. There are two consumers of "which
report binds to which row": the teacher's reconcile write, and the teacher UI's
"ready to confirm" badge. If each matches independently they drift — an earlier
version's badge matched by `github_id`/raw-email only and ignored `invite_token`
and `email_hash`, so it could show "ready" for a row reconcile would NOT bind
(or vice versa). Extract a single `matchReportToRow` (and a `bindReportsToRows`
that runs the one-to-one binding in report order) that both call, so the badge
can never promise something reconcile won't deliver.

### 4. Put team membership on the org invitation (team_ids), not a separate call

To grant classroom access, attach the classroom team via `team_ids` on the
`POST /orgs/{org}/invitations` body. A SEPARATE `PUT teams/{slug}/memberships`
call for a not-yet-org-member creates a **second pending invitation** that the
student must accept separately — so accepting only the org invite leaves them
org-active but **team-pending**, and any `isTeamMember(active)` check fails.
`team_ids` activates org + team membership atomically on a single acceptance.

### 5. The CSV is a cross-binary data contract — coordinate schema changes

`students.csv` is shared with a separate CLI (`gh-teacher`), which preserves
unknown columns verbatim but pins a `FullRosterHeader` lockstep across three
codebases (Go, Python, web). A column rename (e.g. `reconciled_at` ->
`enrolled_at`) or a status-value rename silently churns column order between the
tools unless both sides change together. Treat any CSV header/enum change as a
coordinated cross-repo change (we filed `classroom50-cli#195` and chose a clean
break with no back-compat).

## Why This Matters

Without this pattern, the obvious-looking shortcuts each fail:

- **Deriving the repo name from email/id** makes the name guessable, which
  re-opens squat → victim lockout (not identity hijack — the author check
  blocks that). If you accept that for a simpler lifecycle, you must detect the
  squat (write-permission check + actionable error) and match the full name
  exactly; otherwise prefer an unguessable random suffix, which removes the
  vector entirely at the cost of a non-derivable name.
- **Using team membership as the "has onboarded" signal** is tempting but wrong:
  both invite flows put a student on the team BEFORE they onboard (username flow
  at invite time; email flow via `team_ids`), so team membership means "has
  access," not "submitted a self-report." Conflating them either blocks a
  first-timer's repo creation or shows a misleading "you're all set."
- **A separate team-add call** quietly produces pending memberships that never
  activate, stranding students with no template access and breaking
  completion-state UI.
- **Renaming a CSV field unilaterally** breaks the other tool's round-trip
  through pure column-order churn, even though neither tool errors.

## When to Apply

- Any onboarding/identity/claim flow built on GitHub with **no backend**, where
  a privileged actor reconciles a self-reported identity into authoritative
  state.
- Whenever a "self-report artifact" (repo, gist, issue, PR) must be bound to a
  record and you are tempted to name it by a guessable key.
- Whenever you grant org + team access via the API and need membership to be
  active after a single user acceptance.
- Whenever a file is read/written by more than one tool/binary.

## Examples

**Unguessable naming + content-driven match (the core inversion):**

```text
Student side:  create  onboarding-<id>   (commit YAML self-report)
               guard    if the repo exists but I can't push → squatted → error
Teacher side:  list    onboarding-*  ->  read each YAML
               verify   commit author/committer id == payload.github_id
               match    payload -> roster row by  invite_token > github_id > email
               write    one batched students.csv commit (status -> "enrolled")
               cleanup  delete/archive only the repos actually committed this run
```

**Atomic team membership via the org invite (before vs after):**

```ts
// BEFORE — leaves the student team-pending after they accept the org invite:
await ensureOrgMembership(client, { org, username, inviteeId })
await addUserToTeam(client, { org, teamSlug, username }) // separate pending invite

// AFTER — one acceptance activates org + team membership:
await ensureOrgMembership(client, {
  org,
  username,
  inviteeId,
  teamIds: classroomTeamId ? [classroomTeamId] : undefined,
})
// addUserToTeam remains only as a fallback for already-org-member students
```

**Robustness rules learned the hard way:**

- The "does the student already have a repo?" guard must **throw on a transient
  list error**, not degrade to "none" — a fail-open guard mints a duplicate repo
  for a student who already has one ("transient is NOT none").
- If the YAML commit permanently fails after the repo was created **this call**,
  delete/archive the just-created empty repo so failed retries don't accumulate
  orphans.
- Drive post-commit team-add and repo cleanup from the rows **actually written**
  this run, never the full "resolved" set — an already-enrolled or
  failed-to-rebind row must never have its repo deleted.
- Bound-parallelize per-repo reads (a small concurrency pool, e.g. 8) to avoid
  GitHub secondary rate limits on a large roster while beating a serial loop.

## Related

- `docs/solutions/architecture-patterns/forward-only-cross-binary-repo-name-contract.md` — applies §3 ("the artifact name is a read/delete address, NOT a match key") to a case where the name _is_ derivable: derive membership by forward-constructing the exact expected repo name, never by reverse-parsing arbitrary names.
- `docs/solutions/developer-experience/capability-url-drift-protected-classroom-publishing.md` — the path-contract sibling of §5's data contract; the capability path drifts between the web app and the publisher when the shared formula isn't coordinated.
- `docs/solutions/architecture-patterns/evolving-strict-cross-binary-schemas.md` — the schema-evolution specialization of §5: how to _add_ a field to a shared schema when a consumer parses strictly (advance the leading client behind an opt-in/omitempty write, coordinate laggards via tracked issues, and make the parser tolerate **and** preserve unknown fields). The JSON analogue of §5's "preserve unknown columns verbatim."
