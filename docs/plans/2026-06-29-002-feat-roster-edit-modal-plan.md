---
artifact_contract: ce-unified-plan/v1
artifact_readiness: implementation-ready
execution: code
product_contract_source: ce-plan-bootstrap
title: "feat: Roster edit modal (edit students.csv rows in place)"
type: feat
created: 2026-06-29
closes: "#74"
---

# feat: Roster edit modal (edit `students.csv` rows in place)

**Created:** 2026-06-29
**Type:** feat (web-only)
**Status:** Planned
**Closes:** #74

> Add in-place editing of a roster row's teacher-facing fields — first name, last name, email, section — via a per-row Edit action that opens a modal pre-filled with the current row. The change is written back to `students.csv` through the same git-commit + conflict-retry path the existing add/unenroll mutations use, recomputing `email_hash` when the email changes. Identity and lifecycle fields stay read-only. **No `students.csv` schema change**, so this ships web-only with no `gh-teacher` CLI coordination.

---

## Summary

Teachers currently have no way to edit an existing roster row. The only roster mutations in `src/api/mutations/students.ts` are add, bulk import, mark-enrolled, and unenroll; each row in `src/pages/students/EnrolledStudents.tsx` offers only Re-send, Mark enrolled, and Unenroll. Fixing a typo in a name, correcting an email, or moving a student to a different section forces a destructive unenroll + re-add (which cancels invites and resets enrollment state) or a manual edit of the CSV on GitHub.

This plan adds an `updateStudent` mutation and an Edit modal so a teacher can edit the four teacher-facing fields in place, persisting to `students.csv` and reconciling the cache optimistically — without disturbing identity (`username`, `github_id`) or lifecycle fields (enrollment status/method, invite token, timestamps).

**Product Contract preservation:** N/A — solo plan sourced from issue #74; no upstream brainstorm to preserve.

---

## Problem Frame

- **Who:** A teacher managing a classroom roster (gated by `RequireTeacher`).
- **What's broken:** Roster rows are effectively immutable in the UI after creation. Name typos (common at import time via `UploadRoster.tsx`), wrong/changed emails, and section reassignments cannot be corrected non-destructively.
- **Why it matters:** `email` drives the email invite, the secure onboarding link, and `email_hash`-based reconcile matching; it can't be corrected today without removing the student. `section` is purely organizational and should be freely editable. Unenroll + re-add is the wrong tool — it cancels invites / removes the onboarding repo and resets enrollment state.
- **Constraint:** `students.csv` is a **cross-binary contract** shared with the `gh-teacher` CLI (see CONCEPTS.md). This feature must not change the schema — it only edits values within existing columns.

---

## Requirements

- **R1.** Each roster row (in every section: Ready, Awaiting, Enrolled) exposes an Edit action visible to teachers.
- **R2.** The Edit modal pre-fills `first_name`, `last_name`, `email`, and `section` from the current row and lets the teacher change them.
- **R3.** Saving persists the four fields to `<classroom>/students.csv` and survives a refresh.
- **R4.** Changing `email` recomputes `email_hash` (`emailHash` from `src/util/onboarding.ts`); clearing `email` clears `email_hash`.
- **R5.** Editing never alters `username`, `github_id`, `enrollment_status`, `enrollment_method`, `invite_token`, `invited_at`, or `enrolled_at`.
- **R6.** A non-empty but invalid email is blocked with an inline error before submit (`isValidEmail`).
- **R7.** Editing a row's email into a value already held by **another** row is blocked with a clear error (no silent duplicate).
- **R8.** Edits are rejected on an archived classroom (`assertClassroomNotArchived`), surfaced as an actionable message.
- **R9.** The roster updates optimistically (no flash of stale rows) and reconciles on the next natural refetch (`useUpdateRosterCache`).
- **R10.** Concurrent writes to `classroom50` `main` are retried (`withGitConflictRetry`).

---

## Key Technical Decisions

- **KTD1 — Row identity by `studentKey`.** Target the row to edit by the stable `studentKey` (github_id → username → email, per `src/util/roster.ts`), matching the match-predicate discipline already used by `unenrollStudent`. This survives the fact that the edit itself may change name/email/section but never the identity keys. Rationale: a position index would drift against an eventually-consistent CSV; the identity keys are exactly the fields we hold read-only.
- **KTD2 — Reuse the existing commit pipeline.** `updateStudent` follows the established shape: `assertClassroomNotArchived` → `getBranchRef` → `getCommit` → `getRawFile` → `parseStudentsCsv` → patch the matched row → `stringifyStudentsCsv` → `createGitTree` → `createGitCommit` → `updateRef`, wrapped by `updateStudentWithConflictRetry`. Rationale: identical to add/unenroll, so conflict handling, normalization (`normalizeStudentRow`), and column ordering (`STUDENT_CSV_FIELDS`) stay consistent and no new write path is introduced.
- **KTD3 — Editable field set is the four teacher-facing fields only.** `first_name`, `last_name`, `email`, `section`. All identity/lifecycle columns are preserved from the matched row verbatim. Rationale: identity is bound by onboarding/reconcile (CONCEPTS.md); editing `username`/`github_id` would break self-report matching and the invite contract.
- **KTD4 — Recompute `email_hash` on email change.** When `email` changes, recompute via `emailHash`; when cleared, set `email_hash` to `""`. Rationale: `email_hash` is the cached reconcile match key (CONCEPTS.md, `src/util/onboarding.ts`); leaving a stale hash would silently misroute a future email-based self-report match. Note: editing the email does **not** retroactively rebind an already-`enrolled` row's GitHub identity — it only affects future email-based matching. Surface this caveat in the modal when the row is already enrolled.
- **KTD5 — Modal, not a page.** Render as a `dialog` modal (the issue says "Page/Modal"), consistent with the existing `UnenrollStudentButton` dialog and `ConfirmModal` in the same file. Rationale: lowest-friction, matches existing per-row affordances; no new route needed.
- **KTD6 — Form via TanStack Form mirroring `AddStudent`.** Reuse the `useForm` + `form.Field` + `revalidateLogic()` validator shape from `src/pages/students/AddStudent.tsx`. Rationale: one validation idiom across the students UI; the email validation rule already exists there.
- **KTD7 — Re-entrancy via `useSafeSubmit`.** Wrap the save in `useSafeSubmit` (`src/hooks/useSafeSubmit.ts`) with `mutateAsync`, per the project's double-submit-safety convention. Rationale: every write call site is expected to route through this latch.

---

## Scope Boundaries

**In scope:** an `updateStudent` / `updateStudentWithConflictRetry` mutation; an `EditStudent` modal component; an Edit affordance wired into each rendered roster row; optimistic cache update + invite-query invalidation; email validation, duplicate-guard, archived-guard.

**Out of scope (true non-goals):**

- Editing `username` or `github_id` (identity is onboarding/reconcile-owned — KTD3).
- Any `students.csv` schema change (cross-binary contract).
- Re-sending invites or re-running reconcile as part of an edit (those remain their own row actions).
- Bulk/inline-grid editing of multiple rows at once.

### Deferred to Follow-Up Work

- Inline (non-modal) editing directly in the row.
- An "edit username for an email-only row" escape hatch, if a real need emerges (would require self-report-matching analysis first).

---

## Implementation Units

### U1. `updateStudent` mutation + conflict-retry wrapper

**Goal:** A mutation that edits one roster row's four teacher-facing fields, preserving all identity/lifecycle columns, and commits the rewritten `students.csv`.

**Requirements:** R3, R4, R5, R7, R8, R10.

**Dependencies:** none.

**Files:**

- `src/api/mutations/students.ts` (add `UpdateStudentInput` type, `updateStudent`, `updateStudentWithConflictRetry`)
- `src/api/mutations/students.test.ts` (or the colocated test file matching the repo's existing convention — verify the existing students test path before writing)

**Approach:**

- Input shape: `{ org, classroom, key: string /* studentKey of target */, patch: { first_name; last_name; email; section } }`.
- Follow KTD2's pipeline exactly. Match the target row with a `sameRow` predicate keyed on `studentKey` (mirror the `unenrollStudent` predicate: prefer username/github_id, fall back to email). Throw a clear error if no row matches.
- Build the next row by spreading the matched row and overwriting only the four fields (trimmed), then re-run `normalizeStudentRow`. Preserve `username`, `github_id`, `enrollment_status`, `enrollment_method`, `invite_token`, `invited_at`, `enrolled_at` from the matched row.
- Email handling (KTD4): if the trimmed email differs from the matched row's email, recompute `email_hash` via `emailHash`; if the new email is empty, set `email_hash = ""`. If unchanged, keep the existing `email_hash`.
- Duplicate guard (R7): if the new email is non-empty and case-insensitively equals **another** row's email (any row whose `studentKey` differs from the target), throw `Email already used by another student: <email>`.
- Commit message: `Edit student: <classroom>/<username || email>`.
- Return the updated `StudentCsvRow` (so the caller can `toStudent` it for the optimistic cache write), mirroring `addStudentToClassroom`'s return.
- `updateStudentWithConflictRetry` wraps `updateStudent` in `withGitConflictRetry`, exactly like the existing `*WithConflictRetry` functions.

**Patterns to follow:** `addEmailInviteToClassroom` (email + `emailHash` + dedupe + commit shape) and `unenrollStudent` (`sameRow` match predicate, tree/commit/updateRef) in `src/api/mutations/students.ts`; `withGitConflictRetry` / `assertClassroomNotArchived` in `src/api/mutations/classrooms.ts`.

**Test scenarios:**

- Editing `first_name`/`last_name`/`section` rewrites only those fields; identity + lifecycle columns are byte-for-byte preserved in the output CSV.
- Editing `email` to a new value recomputes `email_hash` (assert it equals `emailHash(newEmail)` and differs from the old).
- Clearing `email` sets both `email` and `email_hash` to empty.
- Leaving `email` unchanged preserves the existing `email_hash` (no needless recompute drift).
- Target matched by github_id when username changed externally; matched by email for an email-only row (no username/github_id).
- No matching row → throws a clear "does not exist" error.
- New email equals another existing row's email (case-insensitive) → throws duplicate error; the CSV is not rewritten.
- Editing a row to an email that case-insensitively equals **its own** current email → allowed (not a false-positive duplicate).
- Archived classroom → `assertClassroomNotArchived` rejects before any commit.
- Output CSV preserves `STUDENT_CSV_FIELDS` column order and drops no other rows.

**Verification:** Unit tests green; the rewritten CSV round-trips through `parseStudentsCsv` with only the edited row changed.

### U2. `EditStudent` modal component

**Goal:** A dialog pre-filled with a student's editable fields that validates input and calls `updateStudentWithConflictRetry` on save.

**Requirements:** R2, R4 (caveat copy), R6, R9, R10.

**Dependencies:** U1.

**Files:**

- `src/pages/students/EditStudent.tsx` (new)

**Approach:**

- Props: `{ org, classroom, student: Student, open, onClose, onSaved }` (or an internal trigger button + controlled `open` state — mirror `UnenrollStudentButton`'s self-contained `dialog` + `useEffect(showModal/close)` pattern in `EnrolledStudents.tsx`). Choose self-contained to match the sibling Unenroll button; final shape is the implementer's call.
- Form via TanStack Form (KTD6): fields `name` is **not** used here (unlike AddStudent's combined name field) — render separate `first_name` and `last_name` inputs plus `email` and `section`, all pre-filled from `student`. Validator: email, when non-empty, must pass `isValidEmail` (reuse AddStudent's rule); otherwise no required fields (a roster row may legitimately have empty name/section).
- Show `username`/`github_id` as read-only context (e.g., a disabled handle line) so the teacher knows which row they're editing; do not render them as editable inputs (R5).
- When `student.enrollment_status === "enrolled"` and the email field is dirty, show an inline note: changing the email won't rebind the confirmed GitHub identity; it only affects future email matching (KTD4 caveat).
- Save: wrap in `useSafeSubmit` (KTD7); call `updateStudentWithConflictRetry(client, { org, classroom, key: studentKey(student), patch })` via `mutateAsync`. On success, call `onSaved(updatedRow)` and close; on error, render an inline `alert-error` with `getErrorMessage(err)`.

**Patterns to follow:** `src/pages/students/AddStudent.tsx` (TanStack Form + `revalidateLogic` + per-field error rendering); `UnenrollStudentButton` in `src/pages/students/EnrolledStudents.tsx` (self-contained `dialog`, `showModal`/`close`, submitting guard, `modal-action` buttons); `useSafeSubmit` usage convention.

**Test scenarios:**

- Modal pre-fills first/last/email/section from the passed `student`.
- Submitting an invalid non-empty email shows an inline error and does not call the mutation.
- Submitting an empty email is allowed (no required-email error).
- On a successful save the modal closes and `onSaved` receives the updated row.
- A mutation error renders an inline error and leaves the modal open.
- For an `enrolled` student, dirtying the email shows the rebind caveat note; for a non-enrolled student it does not.
- (If the repo lacks component-render tests, cover the validator/`patch`-builder as an extracted pure helper instead and note `Test expectation: none -- component-render harness not present` for the JSX shell.)

**Verification:** Editing a row in the running app updates first/last/email/section and the change persists after refresh; invalid email blocked inline.

### U3. Wire the Edit action into each roster row

**Goal:** Add an Edit (pencil) affordance next to Unenroll in `renderStudentRow`, opening `EditStudent` for that student and applying the optimistic cache update on save.

**Requirements:** R1, R9.

**Dependencies:** U2.

**Files:**

- `src/pages/students/EnrolledStudents.tsx`

**Approach:**

- In `renderStudentRow`, add an Edit button (`Pencil` from `lucide-react`) in the existing right-side action cluster, before the `UnenrollStudentButton`. Use the same icon-button styling as the Unenroll button (`btn btn-ghost btn-square`, an `aria-label` like `Edit <displayHandle>`).
- Render `EditStudent` for the row (self-contained open state, mirroring how Unenroll manages its own dialog), so each row owns its modal.
- On `onSaved(updatedRow)`: optimistically patch the cached roster via the existing `updateRosterCache` — replace the row whose `studentKey` matches `studentKey(student)` with `toStudent(updatedRow)` (the `studentKey` is stable across the edit per KTD1/KTD3). Then `invalidateInviteQueries()` (an email/name change can affect invite display, and keeps parity with the other row actions).
- Available in all three sections since they all call `renderStudentRow`.

**Patterns to follow:** the `UnenrollStudentButton` wiring in `renderStudentRow` (`onRemoveStudent` → `updateRosterCache(removeFromRoster(...))` + `invalidateInviteQueries()`); `updateRosterCache`/`toStudent` usage already imported in this file and in `StudentListPage.tsx`.

**Test scenarios:**

- `Test expectation: none -- wiring/JSX only; behavior is covered by U1 (mutation) and U2 (modal).` If the repo has a render test harness for `EnrolledStudents`, add one assertion that each rendered row exposes an `Edit <handle>` control; otherwise rely on the manual verification below.

**Verification:** Every row in Ready / Awaiting / Enrolled shows an Edit button; clicking opens the pre-filled modal; saving updates the row in place with no flash of stale data and the change survives a refresh.

---

## System-Wide Impact

- **Cross-binary contract:** none changed. `updateStudent` writes only within the existing `STUDENT_CSV_FIELDS` columns via `stringifyStudentsCsv`, so the `gh-teacher` CLI contract is untouched — no coordinated release.
- **Reconcile correctness:** the only behavioral coupling is `email_hash`. KTD4 keeps it consistent with `email` so email-based self-report matching (CONCEPTS.md) stays correct; a stale hash would be a silent reconcile bug, which the U1 tests guard against.
- **Eventual consistency:** GitHub's Contents API is read-after-write eventual; U3 follows the established optimistic-cache pattern (`useUpdateRosterCache`) rather than an immediate refetch, identical to add/unenroll.

---

## Verification

- `tsc -b`, `eslint .`, `prettier --check .` clean (React Compiler is on — keep any refs mutated in callbacks, not render, per the `useSafeSubmit` convention).
- `vitest run` green, including the new U1 mutation tests and any U2 helper tests.
- Manual: edit a student's first/last/email/section and confirm the change persists after refresh; clear an email and confirm `email_hash` clears; attempt to edit a row's email to another row's email and confirm it's blocked; attempt an edit on an archived classroom and confirm the archived message; rapid double-click Save fires exactly one write.

---

## Definition of Done

- [ ] `updateStudent` + `updateStudentWithConflictRetry` added, preserving identity/lifecycle fields and recomputing `email_hash` on email change (U1).
- [ ] U1 mutation tests cover happy path, email recompute/clear, identity match by github_id and by email, no-match error, duplicate-email guard (incl. the self-email false-positive case), and archived-classroom rejection.
- [ ] `EditStudent` modal pre-fills the four fields, validates email, shows the enrolled-row rebind caveat, and saves via `useSafeSubmit` + `mutateAsync` (U2).
- [ ] Edit affordance wired into every roster row with optimistic `updateRosterCache` + `invalidateInviteQueries` on save (U3).
- [ ] No `students.csv` schema change; `STUDENT_CSV_FIELDS` order preserved in output.
- [ ] `tsc -b`, eslint, prettier, vitest all clean; manual checks above pass.

---

## Sources & Research

- Issue #74 (`Roster Edit Page/Modal`) — enriched body is the origin for this plan.
- Codebase patterns: `src/api/mutations/students.ts` (`addEmailInviteToClassroom`, `unenrollStudent`, `parseStudentsCsv`/`stringifyStudentsCsv`/`normalizeStudentRow`, `STUDENT_CSV_FIELDS`), `src/api/mutations/classrooms.ts` (`withGitConflictRetry`, `assertClassroomNotArchived`), `src/util/onboarding.ts` (`emailHash`, `isValidEmail`), `src/util/roster.ts` (`studentKey`, `toStudent`), `src/hooks/useGetStudents.ts` (`useUpdateRosterCache`), `src/pages/students/AddStudent.tsx`, `src/pages/students/EnrolledStudents.tsx` (`UnenrollStudentButton`, `renderStudentRow`), `src/hooks/useSafeSubmit.ts`.
- `CONCEPTS.md`: Roster, Enrollment status, Invite token, Cross-binary contract, Reconcile/Confirm enrollment.
- No external research required — strong, directly-applicable local patterns (multiple sibling roster mutations and an existing edit-form + modal idiom).
