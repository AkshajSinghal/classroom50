# Safe-submit foundation PR

**Created:** 2026-06-28
**Type:** feat (web-only foundation)
**Status:** Planned
**Closes:** #28 (P1), #11 (P2), #29 (P2), #22 (P2)

> A web-only foundation PR: make write paths double-submit-safe, make the classroom edit form honest about dirty state, expose an editable/validated assignment slug, and land users on the resource they just created. No `assignments.json` / `classroom.json` / `scores.json` / `students.csv` schema changes -> ships without `classroom50-cli` / skeleton coordination.

## Why this is the right first bundle

The synchronous re-entrancy latch already exists, copy-pasted, in **three** places:

- `src/components/modals/index.tsx` (`submittingRef`, lines 34-39 / 75-91) -- just added in the archive work
- `src/hooks/useReuseAssignment.ts` (`submittingRef`, lines 68-94)
- `src/components/modals/GroupCollaboratorsModal.tsx` (`savingRef`)

Extracting it into one hook removes the duplication. The bundle is justified by the #28/#11/#29/#22 fixes themselves; any reuse by future write features (#9 settings, #31 re-grade, #51 re-publish, eventually #62) is opportunistic upside, not a roadmap dependency — the parity roadmap does not list `useSafeSubmit` as a prerequisite for any of #59-#64, so this is not claimed as critical-path foundation. The optional toast seam likewise establishes a "writes report via toast" convention that **#13** (async-op UX) could later extend -- without building #13 now.

## 1. New primitive: `useSafeSubmit` (foundation) -- closes #28

New file `src/hooks/useSafeSubmit.ts`. Wraps a react-query mutation (or a bare async fn) with a synchronous `useRef` latch set _before_ the await and reset in `finally`/`onSettled`, mirroring the proven ConfirmModal shape:

```ts
// React-Compiler-safe: ref is mutated in callbacks, never during render.
export function useSafeSubmit() {
  const submittingRef = useRef(false)
  const run = useCallback(async (fn: () => Promise<unknown> | void) => {
    if (submittingRef.current) return
    submittingRef.current = true
    try {
      await fn()
    } finally {
      submittingRef.current = false
    }
  }, [])
  return run
}
```

Optional minimal toast seam (scope decision: seam only, no broad migration): a thin variant or option that, on rejection, calls `notify({ tone: "error", ... })` via `useToast()` -- applied only to the writes this PR already touches. Full inline-alert migration (#56) stays a follow-up. **No double-surfacing:** the error toast is added ONLY to converted sites that have no existing failure UI; sites that already render an inline `alert-error` (or equivalent) keep their current error handling untouched, so a failure never shows up twice. Decide this per converted site, not globally.

**Abstraction audit (keep the surface minimal).** `useSafeSubmit` contributes ONLY the synchronous latch (`submittingRef` + `run`); it does not own `canSubmit`, error/warning state, or partial-failure handling. Each consumer keeps its existing pre-checks and result handling locally and only wraps the write in `run`:

- `ConfirmModal` — keeps its `canSubmit` gate + `error` state; wraps `onConfirm` in `run`.
- `useReuseAssignment` — keeps its derived `canSubmit` + `warning` state; wraps `reuse.mutateAsync(...)` in `run` (per the awaitable-`fn` rule above).
- `GroupCollaboratorsModal` — keeps its `tooMany || hasDuplicates` gate + the partial-failure `invalidCollaborators` set; wraps its batched save in `run`.
  This keeps the hook a genuinely shared 1-concern primitive rather than accreting per-consumer options. If an implementer finds a consumer needs more than the latch, that is a signal to keep that consumer inline rather than widen the hook.

Then convert the **seven unguarded write call sites** (six files; `AcceptAssignmentPage` contributes two — the accept button and the `onRerun` path) lacking a synchronous re-entrancy guard (Group B from the inventory) to route through `useSafeSubmit` (and `mutateAsync`), so a same-tick double-click can't fire two writes:

- `src/pages/ClassesPage.tsx` -- accept-invite `mutation.mutate()` @ ~179
- `src/pages/AcceptAssignmentPage.tsx` -- `acceptMutation.mutate()` @ ~649 and the `onRerun` path @ ~661
- `src/pages/OnboardingPage.tsx` -- `onboardMutation.mutate()` @ ~348
- `src/pages/students/EnrolledStudents.tsx` -- `reconcileMutation.mutate()` @ ~766 (the #65-adjacent "Confirm enrollment" button)
- `src/pages/OrgSetupPage.tsx` -- `mutation.mutateAsync` wired straight into `onClick` @ ~111 (no synchronous guard)
- `src/pages/OrgSettingsPage.tsx` -- `patMutation.mutate()` @ ~316 (currently gated only by a tick-late `isPending` check)

**Scope split (de-risk for the deadline window).** The bug-fixing core of this PR is **the hook + the 7 conversions** — that fully closes #28. Refactoring the three _already-correct_ existing latches (`ConfirmModal`, `useReuseAssignment`, `GroupCollaboratorsModal`) to consume `useSafeSubmit` is **dedup/tidiness, not the fix**, and is an explicitly OPTIONAL follow-up step (land it in a separate commit or PR). It is also the highest-risk part: the only regression this review found (the P0 below) exists solely because folding `useReuseAssignment`'s working `onSettled` latch into the `await`/`finally` shape is not behavior-preserving. Converting working code into changed code carries risk for zero user-facing gain, so it must not share the bug fix's risk budget. If the dedup step is taken, it follows the awaitable-`fn` rule below; if deferred, the three latches keep their current correct implementations.

Refactor the three existing ad-hoc latches to consume `useSafeSubmit` (OPTIONAL dedup step per the scope split above; behavior-preserving only under the awaitable-`fn` rule): `ConfirmModal`, `useReuseAssignment`, `GroupCollaboratorsModal`. Keep `isSubmitting`/`isPending` state for button-disabled styling; the ref is the correctness guard.

**The single sketch requires an awaitable `fn`** — `run` resets the latch in `finally` after `await fn()`, so the latch only spans the write when `fn` returns the settling promise. Any `.mutate()` (fire-and-forget) consumer must therefore switch to `mutateAsync`, or the `finally` releases the guard a microtask after `mutate()` returns (before the write settles), reopening the double-submit window. This applies to the seven Group-B sites **and** to `useReuseAssignment`, which today fires `reuse.mutate(...)` and resets its latch in react-query's `onSettled` (`src/hooks/useReuseAssignment.ts:92-94`). Convert `useReuseAssignment.submit` to `await run(() => reuse.mutateAsync(...))` and drop its `onSettled` latch reset (the wrapper's `finally` now owns it). `ConfirmModal` and `GroupCollaboratorsModal` already hold their refs across an `await`, so they fold in directly. (A `.mutate()`-shaped consumer left on `onSettled` is _not_ expressible by this sketch — folding it into `await`/`finally` is not behavior-preserving.)

## 2. Dirty-gate the classroom edit Save -- closes #11

Only `src/pages/classes/EditClassroomForm.tsx` genuinely allows a no-op Save (a no-op commit on the shared `main` branch -> needless 409/retry). Mirror the pattern `CreateAssignmentForm` already uses in edit mode:

- Current submit `form.Subscribe` (lines ~406-418): selector `[state.canSubmit, state.isSubmitting]`, disabled `!canSubmit || isSubmitting || submitted`.
- Change to: selector `[state.canSubmit, state.isSubmitting, state.isDefaultValue]`, disabled `... || isDefaultValue`.

`@tanstack/react-form@1.33.0` exposes `state.isDefaultValue` reliably (already used by `CreateAssignmentForm`). Create forms (`CreateClassroomForm`, `AddStudent`) are intentionally left ungated -- "no changes" isn't meaningful for a create, and `AddStudent`'s validator already blocks an empty submit.

Pair the dirty-gate with an affordance so the disabled state reads as intentional, not broken: give the disabled "Save Classroom" button a `title`/tooltip ("No changes to save") (or equivalent helper text near the action). On an edit form users expect to click Save to confirm, so a silently greyed-out primary action with static label otherwise reads as a bug.

## 3. Expose an editable, validated assignment slug -- closes #22

Today the assignment slug is hidden and silently derived at submit (`slug: slugify(values.name)` in `CreateAssignmentPage.tsx:134`). Expose it as a real form field on `CreateAssignmentForm`, mirroring the **proven pattern already shipping in `CreateClassroomForm`** (`src/pages/classes/CreateClassroomForm.tsx`): a `slug` field that auto-prefills from the name and is uniqueness-validated before submit.

- Add `slug` to `CreateAssignmentFormValues` and render an editable input under the name field.
- **Auto-prefill on name change** while the user hasn't manually edited the slug: mirror `CreateClassroomForm.tsx:117` (`form.setFieldValue("slug", slugify(e.target.value))`). Once the user edits the slug directly, stop auto-overwriting it (track a "touched" flag) so a deliberate slug isn't clobbered by later name edits.
- **Uniqueness validation before submit**, case-insensitive, against the classroom's existing assignment slugs — mirror the `CreateClassroomForm` validator shape (`CreateClassroomForm.tsx:54-59`, "slug is already taken"). The assignment slugs are available via the classroom's `assignments.json` already loaded on the create page; validate against `slug.toLowerCase()`. This is the same case-insensitive collision rule the reuse write-path already enforces (`nextAvailableSlug` in `assignments.ts`), so the form check is optimistic UX and the write path stays the contract guard.
- On submit, send `values.slug` (normalized via `slugify`) instead of re-deriving `slugify(values.name)`.

This is a web-only form change: it does not alter the `assignments.json` schema (the slug field already exists in the contract; this only surfaces and validates it), so no CLI/skeleton coordination.

## 4. Redirect to the created resource -- closes #29

Scope decision: both flows redirect to the created resource.

- `src/pages/CreateClassroomPage.tsx`: add `useNavigate`; in `onSuccess` (lines ~56-62) replace the `setClassroomCreated(true)` inline-alert flag with `navigate({ to: "/$org/$classroom", params: { org, classroom: classroomSlug } })`. `classroomSlug` is already captured in `onSubmit` (line 104). Removes the now-dead `classroomCreated` state + success-alert JSX.
- `src/pages/CreateAssignmentPage.tsx`: it already has `useNavigate` and navigates to the assignments **list** (lines ~75-78). With the editable slug field from Section 3, the submitted slug is a known form value (`values.slug`) — capture it into state in `onSubmit` (the create mutation's `onSuccess` receives only `result`, not `values`, so the slug must come from state, not the success-callback args), then on success (no template-grant warning) navigate to `{ to: "/$org/$classroom/assignments/$assignment", params: { org, classroom, assignment: createdSlug } }`. No `slugify(values.name)` re-derivation. Preserve the existing "stay on page if `result.templateGrantWarning`" branch.

**Eventual-consistency + success-confirmation handling (required, not optional).** GitHub's contents API is read-after-write eventual — the same constraint the archive work relied on — so an immediate redirect can land on a page whose `classroom.json` / `assignments.json` has not yet propagated, showing an empty/404 state right after a _successful_ create. The removed `CreateClassroomPage` inline alert was the only copy setting the "may take a minute or two to appear" expectation. Therefore each create `onSuccess` must, **before** `navigate(...)`, fire a success toast via the `NotificationProvider` (which lives above the router and survives the unmounting form) carrying the create confirmation and the "may take a minute to appear" caveat — so the success signal is not silently dropped on redirect. Additionally, the landing route (`/$org/$classroom`, and the assignment detail page) must render a pending/empty affordance with retry rather than an error when the just-created file 404s on the first read.

## Explicitly OUT of scope (kept as follow-ups)

- **#25** route guards (P1, security) -- separate authorization concern, its own PR.
- **#13** full async-op UX, **#9** settings pages, **#31/#51** triggers, **#56** full toast migration -- these _consume_ the foundation; land the primitive first.
- No schema/contract changes of any kind.

**Sequencing vs #62 (the parity long pole).** This bundle is web-only and ships independently of `classroom50-cli` / the skeleton, so it does not block — and is not blocked by — **#62** (cutoff dates + extensions), the heaviest, most cross-repo-coordinated parity feature and the one most likely to slip before the 2026-08-28 GHC retirement. Running this small, independent PR first is fine _only if_ #62's cross-repo schema coordination with `classroom50-cli` and the skeleton kicks off in parallel rather than waiting on this. Do not let foundation/cleanup work consume the runway the long-pole feature needs: start the #62 coordination thread now, independently of this PR.

## Verification

- `tsc -b`, `eslint .`, `prettier --check .` clean (note: React Compiler is on -- keep the hook ref-mutation in callbacks, not render).
- `vitest run` green; add a focused unit test for `useSafeSubmit` (second same-tick call is a no-op; latch resets after settle) following the existing pure-logic test style.
- Manual: rapid double-click each converted button fires exactly one write; an unchanged "Save Classroom" is disabled (with a "No changes to save" affordance); the create-assignment slug prefills from the name, is editable, and rejects a duplicate slug before submit; creating a classroom/assignment lands on the new resource's page with a success toast.

## Implementation checklist

- [ ] Add `src/hooks/useSafeSubmit.ts` (synchronous ref latch, React-Compiler-safe; optional toast-on-error seam via `useToast`)
- [ ] Add a focused unit test for `useSafeSubmit` (same-tick re-entry is a no-op; latch resets after settle)
- [ ] Convert the 7 unguarded write call sites (ClassesPage, AcceptAssignmentPage incl `onRerun`, OnboardingPage, EnrolledStudents reconcile, OrgSetupPage, OrgSettingsPage) to route through `useSafeSubmit` + `mutateAsync`
- [ ] (Optional, separate commit/PR) Refactor ConfirmModal, useReuseAssignment, GroupCollaboratorsModal to consume `useSafeSubmit` (behavior-preserving dedup, awaitable-`fn` rule) -- not required to close #28
- [ ] Dirty-gate EditClassroomForm Save: add `state.isDefaultValue` to the submit `Subscribe` selector + disabled expression, with a "No changes to save" affordance on the disabled button
- [ ] Expose an editable assignment slug on `CreateAssignmentForm` (add `slug` to form values; auto-prefill from name via `slugify` until manually touched; case-insensitive uniqueness validation before submit, mirroring `CreateClassroomForm`); submit `values.slug` instead of `slugify(values.name)`
- [ ] CreateClassroomPage: redirect `onSuccess` to `/$org/$classroom` (the created classroom); remove dead `classroomCreated` alert state; fire a success toast (with eventual-consistency caveat) before navigating
- [ ] CreateAssignmentPage: capture the submitted `values.slug` in `onSubmit` and redirect `onSuccess` to `/$org/$classroom/assignments/$assignment` (preserve `templateGrantWarning` stay-on-page branch); fire a success toast before navigating
- [ ] Landing routes show a pending/empty (not error) affordance when a just-created `classroom.json` / `assignments.json` 404s on first read (read-after-write eventual consistency)
- [ ] Run `tsc -b`, eslint, prettier, vitest; manual double-click / dirty-Save / post-create-redirect checks
