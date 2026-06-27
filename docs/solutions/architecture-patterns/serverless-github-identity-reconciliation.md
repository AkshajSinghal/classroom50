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

### 1. Name the self-report artifact by an unguessable, self-bound key — not by a derived key

Each student creates a private "onboarding repo" holding a
`.classroom50-onboarding.yaml` self-report (their claimed email + name; their
GitHub-attested `github_username`/`github_id`). Name it:

```
classroom50-onboarding-<github-id>-<random-hash>
```

- The **github-id segment** scopes a prefix list so a student (or the teacher)
  can find a student's own repos: `classroom50-onboarding-<id>-`.
- The **browser-generated random suffix** (128 bits of hex) makes the full name
  unguessable, so no other org member can **pre-create / squat** a victim's
  onboarding repo, and it is unique per onboarding attempt (a student in two
  classrooms of one org gets two distinct repos — no collision).

Do NOT derive the name from a guessable input (email hash, or a bare github-id).
A guessable name re-opens a squat/denial-of-service: any org member can
pre-create `…-<victimId>` and the victim's create then 422s and their commit
403s, locking them out with no fallback name.

### 2. Trust the self-report only after a GitHub-attested author check

The YAML's `github_username`/`github_id` are written by the authenticated
student, but a teacher must still verify the writer IS who they claim. Read the
commit author/committer ids of the YAML file and require the claimed
`github_id` to be among them. This is what makes the unguessable name safe: a
squatter can only ever author commits as themselves, so they can only bind
their own attested id.

### 3. The artifact name is a read/delete address, NOT a match key

Because the random suffix is not derivable by the teacher, reconciliation must
NOT try to recompute the name. Instead: **list onboarding repos by the shared
prefix, read each YAML, and match the payload back to a roster row by content**,
strongest key first:

1. `invite_token` (an always-minted, teacher-issued per-row secret written into
   the YAML when the student used a unique secure link) — unguessable, binds to
   the exact row.
2. `github_id` — immutable; binds a username-invited row.
3. `email` — last resort; the accepted-residual-risk path (the YAML email is
   attacker-controllable, so this is hardened: only match a row with no stronger
   key and a real email key, and route ambiguous multi-match to "needs
   attention" rather than guessing).

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

- **Deriving the repo name from email/id** seems convenient (the teacher can
  fetch it directly) but it is guessable, which re-opens squat + hijack. The
  unguessable name + content-driven match trades one cheap `GET` for a prefix
  list, and removes a whole class of identity attacks.
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
Student side:  create  classroom50-onboarding-<id>-<random>   (commit YAML self-report)
Teacher side:  list    classroom50-onboarding-*  ->  read each YAML
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
