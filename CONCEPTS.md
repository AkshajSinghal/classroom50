# Concepts

Shared domain vocabulary for this project — entities, named processes, and status concepts with project-specific meaning. Seeded with core domain vocabulary, then accretes as ce-compound and ce-compound-refresh process learnings; direct edits are fine. Glossary only, not a spec or catch-all.

## Onboarding & enrollment

- **Onboarding** — the student-side flow where an invited student self-reports their identity so the teacher can add them to the classroom roster. Distinct from being an org/team member: a student can have classroom access (be on the team) yet not have onboarded.

- **Onboarding repo** — a private repo a student creates in the org to carry their self-report, named `classroom50-onboarding-<github-id>-<random-hash>`. The random suffix makes the name unguessable (squat-proof) and unique per onboarding; it is a read/delete address, not a teacher-side lookup key.

- **Self-report** — the `.classroom50-onboarding.yaml` payload committed into the onboarding repo: the student's claimed email + name plus their GitHub-attested `github_username`/`github_id`, and an optional `invite_token`.

- **Reconcile / Confirm enrollment** — the teacher action that reads the onboarding self-reports, verifies each writer's GitHub-attested identity, binds it to the matching `students.csv` row, and marks the row enrolled. "Reconcile" is the internal/process name; "Confirm enrollment" is the teacher-facing label.

- **Enrollment status** — a `students.csv` lifecycle value: `invited` (invite sent / self-reported via onboarding, no GitHub identity bound and confirmed yet) and `enrolled` (identity bound and confirmed by the teacher). Renamed from the former `reconciled`; the CSV is a contract shared with the gh-teacher CLI.

- **Invite token** — an unguessable per-student secret minted on every roster row. When the student onboards via their unique secure link, it is written into the self-report YAML and is reconcile's strongest match key, binding the report to the exact roster row.

- **Classroom team** — the per-classroom GitHub team (`classroom50-<classroom>`) that grants rostered students read access to private assignment templates. Both invite flows place students on it via `team_ids` on the org invitation so membership activates on a single acceptance.

- **Roster** — the `students.csv` file (in the private `classroom50` config repo) that is the source of truth for who is in a classroom and their enrollment status.

## Assignments & classrooms

- **Accepted (assignment)** — a student has accepted an assignment when their per-student assignment repository exists in the org (named by the shared repo-name formula). Acceptance is implicit and derived, not an event: there is no backend to record it, so "accepted" is inferred from repo existence. Distinct from **submitted** (a graded push exists in `scores.json`) and from **enrolled** (identity bound in the roster) — a student can be accepted without having submitted.

- **Cross-binary contract** — a name, path, or schema whose format is shared across more than one independently-shipped tool (the web app, the `gh-teacher` CLI, the autograder/publisher), so it can only be changed by coordinating all sides. Examples in this project: the `students.csv` schema, the `assignments.json` schema, the published-resource capability path, and the student repo-name formula. Two disciplines: construct shared names in one agreed direction and never re-derive a shared value by reverse-parsing it; and evolve a shared schema additively with forward-compatible parsing (tolerate _and_ preserve unknown fields) rather than strict rejection or lockstep releases — a strict "reject unknown fields" parser turns every additive field into a coordinated release, and tolerate-without-preserve on a round-tripping tool silently drops a newer client's field.

- **Pass threshold** — an assignment's opt-in passing bar: the percentage of max score at or above which a submission counts as passing in the gradebook (passing rollup, score badges, passing/failing filter). Off by default; a display threshold only — it does not change a student's actual score. Stored in `assignments.json` only when the teacher enables it.

- **Protected classroom** — a classroom whose `classroom.json` carries a `secret`, so its published resources are unlisted behind a capability path rather than living at the guessable default location. The opposite of an unprotected classroom, whose resources sit at the plain, guessable path.

- **Classroom secret** — the per-classroom unguessable value that, when present, marks a classroom protected and becomes the extra path segment under which its published resources live. It is a friction/anti-discovery credential carried in the accept link, not a cryptographic access control.

- **Capability path** — the published-resource location for a protected classroom, formed by inserting the classroom secret as a path segment so the URL itself is the credential ("the URL is the credential"). Unprotected classrooms publish to the plain path with no secret segment; a protected classroom whose publisher writes to the plain path is a drift bug, not a valid fallback.

- **Cutoff date** — a hard deadline (distinct from the soft `due` date) after which a student loses write access to their assignment repository. Unlike `due`, which only labels late submissions, a cutoff revokes access. Planned; coordinated with the `assignments/v1` schema.

- **Deadline extension** — a per-student or per-group grant that restores/retains write access past an assignment's cutoff, with a corresponding "Deadline extended" label. Revocable. Planned.

- **Classroom archive** — a classroom lifecycle state (`archived` in `classroom.json`) that blocks new assignments and new accepts and hides the classroom from the default list while preserving its roster/assignments. Reversible (unarchive). Planned.

- **Tamper flag** — a gradebook signal that a submission edited a protected/disallowed grading file (relative to the assignment's `allowed_files`). Emitted by the autograde/collect-scores pipeline into `scores.json` and surfaced as a badge. Planned.
