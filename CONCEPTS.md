# Concepts

Shared domain vocabulary for this project — entities, named processes, and status concepts with project-specific meaning. Seeded with core domain vocabulary, then accretes as ce-compound and ce-compound-refresh process learnings; direct edits are fine. Glossary only, not a spec or catch-all.

## Onboarding & enrollment

- **Onboarding** — the student-side flow where an invited student self-reports their identity so the teacher can add them to the classroom roster. Distinct from being an org/team member: a student can have classroom access (be on the team) yet not have onboarded.

- **Onboarding repo** — a private repo a student creates in the org to carry their self-report, named `classroom50-onboarding-<github-id>-<random-hash>`. The random suffix makes the name unguessable (squat-proof) and unique per onboarding; it is a read/delete address, not a teacher-side lookup key.

- **Self-report** — the `.classroom50-onboarding.yaml` payload committed into the onboarding repo: the student's claimed email + name plus their GitHub-attested `github_username`/`github_id`, and an optional `invite_token`.

- **Reconcile / Confirm enrollment** — the teacher action that reads the onboarding self-reports, verifies each writer's GitHub-attested identity, binds it to the matching `students.csv` row, and marks the row enrolled. "Reconcile" is the internal/process name; "Confirm enrollment" is the teacher-facing label.

- **Enrollment status** — a `students.csv` lifecycle value: `invited` (invite sent, no GitHub identity bound), `onboarded` (self-reported, not yet confirmed), `enrolled` (identity bound and confirmed by the teacher). Renamed from the former `reconciled`; the CSV is a contract shared with the gh-teacher CLI.

- **Invite token** — an unguessable per-student secret minted on every roster row. When the student onboards via their unique secure link, it is written into the self-report YAML and is reconcile's strongest match key, binding the report to the exact roster row.

- **Classroom team** — the per-classroom GitHub team (`classroom50-<classroom>`) that grants rostered students read access to private assignment templates. Both invite flows place students on it via `team_ids` on the org invitation so membership activates on a single acceptance.

- **Roster** — the `students.csv` file (in the private `classroom50` config repo) that is the source of truth for who is in a classroom and their enrollment status.
