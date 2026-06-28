---
title: "Copying a record across a strict, round-tripped cross-binary contract: spread, deep-clone known, drop undefined"
date: 2026-06-28
problem_type: architecture_pattern
track: knowledge
category: architecture-patterns
module: assignments
component: "assignments.json cross-binary schema (classroom50/assignments/v1)"
tags:
  - cross-binary-contract
  - record-copy
  - unknown-fields
  - deep-clone
  - omitempty
  - strict-json-parsing
  - shared-data-contract
applies_when:
  - "Copying / cloning an existing record across a JSON document whose schema is shared by more than one binary/tool"
  - "A sibling consumer parses strictly (DisallowUnknownFields / additionalProperties:false) and round-trips (re-serializes) the file"
  - "This client does not model every field in the contract, so a known-field allowlist projection would silently drop a newer binary's field"
  - "The schema is omitempty/omit-on-unset, so emitting null or an undefined key would be rejected or would corrupt data"
  - "Falsy-but-meaningful values (0, [], empty string) carry contract meaning distinct from absent"
related_repos:
  - "foundation50/classroom50-cli (gh-teacher: strict DisallowUnknownFields parser that round-trips assignments.json; gh-student tolerates unknown fields)"
related_docs:
  - "docs/solutions/architecture-patterns/evolving-strict-cross-binary-schemas.md (the ADD-A-FIELD variant of this same strict cross-binary contract; this doc is the RECORD-COPY variant)"
  - "docs/solutions/architecture-patterns/forward-only-cross-binary-repo-name-contract.md (the NAME contract in the same cross-binary family)"
  - "docs/solutions/developer-experience/capability-url-drift-protected-classroom-publishing.md (the PATH contract sibling in the cross-binary-contract cluster)"
---

## Context

`classroom50-web` is a 100% client-side app over GitHub: there is no backend, and
the source of truth for an assignment lives in `assignments.json`, a file carrying
the schema id `classroom50/assignments/v1` that is **shared across three
independently-shipped binaries** — the web app, the Go `gh-teacher` CLI, and the
autograder. The teacher CLI parses that file **strictly**
(`json.Decoder.DisallowUnknownFields()`, backed by `additionalProperties:false`)
and **round-trips** it on `gh teacher assignment add` (decode -> mutate -> re-serialize
the whole file). An unknown or `null` key doesn't get ignored — it fails the read
outright with `json: unknown field "…"`.

The "Reuse assignment" feature (#60) copies a single assignment record from one
classroom into another in-org classroom. That makes it a pure data-copy across the
same strict, round-tripped contract: we take an existing normalized `Assignment`
object, change only its `slug`/`name`, and write it into the target's
`assignments.json`. Two questions decide whether the copy is correct: **what shape
goes onto the wire** (so the strict Go parser accepts it and so a future field
isn't dropped), and **who actually guards the write** (the optimistic client checks
vs. the authoritative server-side re-validation). This learning captures the
copy-record discipline that answers both — it is the *copy/clone* sibling of the
*field-ADD* learning in
`evolving-strict-cross-binary-schemas.md` and the *name-construct* learning in
`forward-only-cross-binary-repo-name-contract.md`.

## Guidance

**When you copy a normalized record across a strict, round-tripped cross-binary JSON
contract, spread the WHOLE source first to preserve unknown/future fields verbatim,
deep-clone only the fields you model, DELETE keys that resolve to `undefined` so the
JSON stays omitempty-clean, and re-validate authoritatively on the write path —
never trust the optimistic UI check as the contract guard.**

### 1. Spread the whole source first — tolerate AND preserve unknown fields

The copy starts by spreading the entire source object, *then* overriding the two
fields it intends to change:

```ts
const entry: Assignment = {
  // Spread the whole source so a field this client doesn't model yet rides
  // through — deliberate. assignments.json is a strict cross-binary contract
  // that evolves by one binary adding a field before the others; preserving
  // unknown keys is the "tolerate AND preserve" rule from
  // evolving-strict-cross-binary-schemas.md (an allowlist would drop them).
  // Known nested objects/arrays are re-cloned below so nothing is shared.
  ...source,
  slug,
  name,
  // …deep clones below…
}
```

The `...source` spread is the load-bearing decision. Because a newer binary may have
already written a field this web build doesn't know about (the exact scenario
`evolving-strict-cross-binary-schemas.md` describes for `pass_threshold`), the copy
must carry that field through verbatim. The tempting alternative — explicitly
building the entry from an **allowlist** of known fields — would silently **DROP**
any field a newer writer added, turning a copy into lossy data destruction on the
same round-trip class the sibling doc warns about. "Tolerate AND preserve" is not
just a parser rule; it is a copy rule.

### 2. Deep-clone only the modeled nested fields — and call out the shallow-share caveat

Right after the spread, every nested object/array the type models is re-cloned so
the copy shares no mutable structure with the source:

```ts
  template: source.template ? { ...source.template } : undefined,
  due_meta: source.due_meta ? { ...source.due_meta } : undefined,
  runtime: source.runtime
    ? {
        ...source.runtime,
        container: source.runtime.container
          ? { ...source.runtime.container }
          : undefined,
      }
    : undefined,
  allowed_files: source.allowed_files ? [...source.allowed_files] : undefined,
  tests: source.tests ? source.tests.map((t) => ({ ...t })) : undefined,
```

**Caveat to state explicitly:** this clones only the *modeled* nested fields. An
*unknown* nested object that rode in via `...source` (§1) is **shallow-shared** with
the source — the spread copies its reference, not its contents. That is acceptable
here *only* because `source` is treated as read-only: the copy is serialized and
written immediately, and nothing mutates the shared sub-tree afterward. If this code
ever began mutating an unknown nested field in place, the shallow share would leak
back into the source object. The two rules pull in opposite directions — preserve
unknown fields (so you can't enumerate them to deep-clone) vs. don't share mutable
structure — and the resolution is the read-only-source invariant, which must be
preserved.

### 3. DELETE keys that resolve to `undefined` — stay omitempty-clean

A modeled-but-absent field resolves to `undefined` above. Leaving it in the object
is not free: `JSON.stringify` would emit nothing for `undefined`, but the
intermediate object would still carry the key, and any code path that serialized it
differently (or a `null`) would feed the strict Go parser a key it rejects. So the
copy deletes every key that came out `undefined`:

```ts
  if (!entry.template) delete entry.template
  if (!entry.due_meta) delete entry.due_meta
  if (entry.runtime && !entry.runtime.container) delete entry.runtime.container
  if (!entry.runtime) delete entry.runtime
  if (!entry.allowed_files) delete entry.allowed_files
  if (!entry.tests) delete entry.tests
```

This keeps the written JSON byte-for-byte equivalent to what a minimal-source author
would have produced — no `"template": null`, no empty `runtime` husk — which matters
because the CLI's `DisallowUnknownFields` plus its omitempty Go tags reject stray /
null keys.

### 4. Preserve falsy-but-meaningful values

The cleanup tests **truthiness of the field itself**, never of its scalar contents,
precisely so that legitimately falsy values survive:

- `pass_threshold: 0` is a real, meaningful value (a 0% pass threshold), not "unset".
  It is carried by `...source` and never touched by the cleanup, so it round-trips intact.
- An empty array (`tests: []`, `allowed_files: []`) is **truthy**, so the
  `if (!entry.tests) delete …` guard does not fire — `[]` is preserved as present.
  `absent` vs `[]` can mean different things to the CLI, so the copy faithfully
  reproduces the source's choice rather than normalizing one into the other.

The discipline: *delete on the field being undefined, never on the value being falsy.*

### 5. The UI check is UX; the write path is the contract guard

The reuse modals prefill a slug with `nextAvailableSlug`, which does a
case-insensitive "is this slug taken?" scan and auto-suffixes `-2`, `-3`, …. That is
purely **optimistic UX** — a good default in the form. It is explicitly **not** the
guard. `copyAssignmentToClassroom` re-checks everything authoritatively on the write
path, after re-reading the target file at the commit it is about to build on:

- **Case-insensitive slug collision**, re-read live, so a mixed-case programmatic
  slug (or a slug taken since the modal opened) can't slip past.
- **Fail-closed template re-check.** `getRepo` returns `null` on a 404 (deleted,
  renamed, or made private outside the org). The write refuses *before any commit*
  rather than persisting a record that points at a template students can't generate
  from.
- **Private-out-of-org refusal.** A private template owned outside the org can't have
  the target classroom's students granted read, so the write refuses with an
  actionable message rather than committing a broken assignment.
- **`templateGrantWarning` partial-failure surface.** When an in-org private template
  *does* need a team grant, the grant is attempted *after* the commit succeeds, and
  any failure is returned as a non-fatal `templateGrantWarning` rather than throwing
  — the assignment was copied successfully; only the convenience grant is degraded.

The rule: optimistic client checks improve the form, but the **write path** is the
only place the cross-binary contract is actually enforced. Never let the UI check be
the contract guard.

## Why This Matters

Each shortcut fails on this specific strict, round-tripped contract:

- **Build the copy from an allowlist of known fields.** Cleaner-looking, but it
  silently **drops** any field a newer binary already wrote (e.g. a future
  `pass_threshold`-style addition) — lossy on the very round-trip
  `evolving-strict-cross-binary-schemas.md` warns about. `...source` is what makes
  the copy forward-compatible.
- **Spread and stop (no `delete`).** Modeled-but-absent fields linger as `undefined`
  or get serialized as `null`, and the strict Go parser (`DisallowUnknownFields`)
  rejects the write. The omitempty `delete` pass is what keeps the JSON clean.
- **Treat falsy as unset.** A `pass_threshold: 0` or an intentional `[]` gets
  normalized away, changing the assignment's meaning during a copy.
- **Trust the modal's slug check.** The optimistic, case-insensitive
  `nextAvailableSlug` prefill races against concurrent writes and can be bypassed by
  a mixed-case programmatic slug; only the write-path case-insensitive collision
  check, re-read live, actually prevents a duplicate.
- **Trust a stale template reference.** A template deleted or moved out-of-org since
  the modal opened would produce a committed-but-broken assignment; the fail-closed
  `getRepo`-null refusal stops the commit before it happens.

Together: `...source` + selective deep-clone + omitempty `delete` produce a copy that
is forward-compatible *and* strict-parser-clean, while authoritative write-path
re-validation guarantees the contract regardless of what the optimistic UI allowed.

## When to Apply

- You are **copying or cloning a record** (not just adding a field) whose JSON is
  read/written by **more than one independently-shipped binary**, especially when one
  consumer parses strictly (`DisallowUnknownFields` / `additionalProperties:false`)
  and **round-trips** the file.
- The record may contain fields **this build doesn't model** because a sibling binary
  is ahead of you on an additive v1 change — preserve them verbatim by spreading the
  whole source rather than rebuilding from an allowlist.
- The record has **falsy-but-meaningful** scalars (`0`, `false`) or **present-empty**
  collections (`[]`) whose absent-vs-empty distinction the consumer cares about.
- A client-side optimistic check (slug availability, "taken?" scan, auto-suffix)
  prefills a form — make sure the **write path** independently re-validates the same
  invariant, because the UI check is UX, never the contract guard.

Reusable recipe: `...source` first (tolerate **and** preserve) -> deep-clone only the
modeled nested fields (keep `source` read-only so the shallow-shared unknowns are safe)
-> `delete` keys that resolved to `undefined` (omitempty-clean) -> leave falsy/empty
values untouched -> re-validate authoritatively on write.

## Examples

All examples below are from the shipped implementation and its tests.

**The copy builder — spread-first, deep-clone modeled fields, then omitempty `delete`**
(`src/api/mutations/assignments.ts`, `buildReusedEntry`):

```ts
const entry: Assignment = {
  // Spread the whole source so a field this client doesn't model yet rides
  // through — the "tolerate AND preserve" rule from
  // evolving-strict-cross-binary-schemas.md (an allowlist would drop them).
  ...source,
  slug,
  name,
  template: source.template ? { ...source.template } : undefined,
  due_meta: source.due_meta ? { ...source.due_meta } : undefined,
  runtime: source.runtime
    ? {
        ...source.runtime,
        container: source.runtime.container
          ? { ...source.runtime.container }
          : undefined,
      }
    : undefined,
  allowed_files: source.allowed_files ? [...source.allowed_files] : undefined,
  tests: source.tests ? source.tests.map((t) => ({ ...t })) : undefined,
}
if (!entry.template) delete entry.template
if (!entry.due_meta) delete entry.due_meta
if (entry.runtime && !entry.runtime.container) delete entry.runtime.container
if (!entry.runtime) delete entry.runtime
if (!entry.allowed_files) delete entry.allowed_files
if (!entry.tests) delete entry.tests
```

**Deep-copy isolation — the copy shares no mutable structure with the source**
(`assignments.test.ts`):

```ts
const entry = buildReusedEntry(fullSource, { slug: "hw1", name: "Homework 1" })

expect(entry.template).not.toBe(fullSource.template)
expect(entry.runtime).not.toBe(fullSource.runtime)
expect(entry.runtime?.container).not.toBe(fullSource.runtime?.container)
expect(entry.tests?.[0]).not.toBe(fullSource.tests?.[0])

// Mutating the copy must not leak back into the source.
entry.allowed_files?.push("extra")
entry.tests?.push({ type: "run", name: "x", run: "x", points: 0 })
expect(fullSource.allowed_files).toHaveLength(2)
expect(fullSource.tests).toHaveLength(1)
```

**Omit-undefined — absent modeled fields are deleted, not written as `undefined`/`null`**
(omitempty-clean for the strict CLI parser):

```ts
const minimal: Assignment = {
  slug: "bare", name: "Bare", mode: "individual", autograder: "default",
}
const entry = buildReusedEntry(minimal, { slug: "bare2", name: "Bare 2" })

expect("template" in entry).toBe(false)
expect("due_meta" in entry).toBe(false)
expect("runtime" in entry).toBe(false)
expect("allowed_files" in entry).toBe(false)
expect("tests" in entry).toBe(false)
```

**Preserve `pass_threshold: 0` — falsy but meaningful, never normalized away:**

```ts
const source: Assignment = {
  slug: "z", name: "Zero", mode: "individual", autograder: "default",
  pass_threshold: 0,
}
const entry = buildReusedEntry(source, { slug: "z2", name: "Zero 2" })
expect(entry.pass_threshold).toBe(0)
```

**Preserve an empty `[]` — present, not dropped** (an empty array is truthy, so the
omitempty cleanup must NOT delete it; `absent` vs `[]` can differ to the CLI):

```ts
const source: Assignment = {
  slug: "e", name: "Empties", mode: "individual", autograder: "default",
  tests: [], allowed_files: [],
}
const entry = buildReusedEntry(source, { slug: "e2", name: "Empties 2" })
expect(entry.tests).toEqual([])
expect(entry.allowed_files).toEqual([])
```

**Authoritative write-path re-validation** (`copyAssignmentToClassroom`) — the UI's
optimistic `nextAvailableSlug` prefill is *not* the guard; the write re-checks live:

```ts
// Fail-closed template re-check, run concurrently with the ref read, throwing
// before any commit.
const [repo, ref] = await Promise.all([
  entry.template
    ? getRepo(client, entry.template.owner, entry.template.repo)
    : Promise.resolve(null),
  getBranchRef(client, org),
])
if (entry.template) {
  if (!repo) throw new Error("Template … is not visible — deleted/renamed/private outside org.")
  if (repo.private) {
    const inOrg = entry.template.owner.toLowerCase() === org.toLowerCase()
    if (!inOrg) throw new Error("Template … is private and outside the org — …")
    needsTeamGrant = true
  }
}

// Case-insensitive slug collision, re-read live from the target file.
const entrySlugLower = entry.slug.toLowerCase()
if (currentAssignments.assignments.some((a) => a.slug.toLowerCase() === entrySlugLower)) {
  throw new Error(`Assignment "${entry.slug}" already exists in classroom "${targetClassroom}".`)
}

// Partial-failure: the team grant is attempted AFTER the commit and degrades to
// a non-fatal warning rather than throwing.
let templateGrantWarning: string | undefined
if (needsTeamGrant && entry.template) {
  templateGrantWarning = await tryGrantTeamTemplateRead(client, org, targetClassroom, entry.slug, entry.template)
}
```

## Related

- `docs/solutions/architecture-patterns/evolving-strict-cross-binary-schemas.md` — the
  field-**ADD** variant on the same `classroom50/assignments/v1` contract. It establishes
  the "tolerate AND preserve unknown fields" rule for a strict, round-tripping consumer;
  this learning is the **copy/clone** application of that rule (`...source` first, never an
  allowlist) plus the omitempty-`delete` and write-path re-validation discipline specific
  to copying a whole record.
- `docs/solutions/architecture-patterns/forward-only-cross-binary-repo-name-contract.md` —
  the **name** contract sibling: derive names by forward-constructing the shared formula.
  `nextAvailableSlug` follows that rule (it forward-constructs `-2`, `-3`, … candidates and
  tests them against a `taken` set rather than reverse-parsing existing names), and like the
  slug check here it is optimistic UX prefill that the write path re-checks authoritatively.
- `docs/solutions/developer-experience/capability-url-drift-protected-classroom-publishing.md`
  — the **path** contract sibling; together (data/schema-evolution, name, path, and this
  record-copy specialization) they form the cross-binary-contract cluster.
