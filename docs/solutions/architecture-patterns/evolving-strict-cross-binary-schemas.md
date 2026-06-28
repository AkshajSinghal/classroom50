---
title: "Evolving a strict cross-binary schema: advance the web client first, keep parsing forward-compatible"
date: 2026-06-28
problem_type: architecture_pattern
track: knowledge
category: architecture-patterns
module: assignments
component: "assignments.json cross-binary schema (classroom50/assignments/v1)"
tags:
  - cross-binary-contract
  - schema-evolution
  - forward-compatibility
  - unknown-fields
  - opt-in-default-off
  - snake-case-house-style
  - shared-data-contract
applies_when:
  - "Adding a field to a JSON document whose schema is shared across more than one binary/tool"
  - "A sibling consumer parses strictly (DisallowUnknownFields / additionalProperties:false) and round-trips (re-serializes) the file"
  - "You can advance one writer ahead of the readers and coordinate the rest via tracked issues instead of a flag day"
  - "A new field is opt-in/off-by-default so it is only emitted when a user enables it"
related_repos:
  - "foundation50/classroom50-cli (gh-teacher: strict parser to relax in classroom50-cli#199 and #200; gh-student already tolerates unknown fields)"
related_docs:
  - "docs/solutions/architecture-patterns/serverless-github-identity-reconciliation.md (cross-binary data contract over GitHub)"
  - "docs/solutions/architecture-patterns/forward-only-cross-binary-repo-name-contract.md (forward-construct shared names; same cross-binary contract family)"
  - "docs/solutions/developer-experience/capability-url-drift-protected-classroom-publishing.md (sibling cross-binary shared-formula drift failure)"
---

# Evolving a strict cross-binary schema: advance the web client first, keep parsing forward-compatible

## Context

`classroom50-web` is a 100% client-side app over GitHub: no backend, all state
lives in repos and JSON config files. The gradebook needed a new per-assignment
field, `pass_threshold` — an opt-in passing percentage the gradebook can display
and (optionally) enforce — persisted into `assignments.json`. That file is not
private to the web app: it carries the schema id `classroom50/assignments/v1`
and is **shared across three independently-shipped binaries** — the web app, the
Go `gh-teacher` CLI, and the autograder.

Before writing a single byte of the new field, we READ the consumer that owns
the strictest contract. The findings decided the whole approach:

- The teacher CLI parses **strictly**: `json.Decoder.DisallowUnknownFields()` on
  the Go side, backed by `additionalProperties: false` in the JSON schema.
- Worse, `gh teacher assignment add` **round-trips the entire file** — the upsert
  decodes `assignments.json`, mutates one assignment, and re-serializes the
  whole thing. So a newer web client that writes an unknown `pass_threshold`
  field doesn't just get ignored by the next CLI command; that command FAILS
  outright with `json: unknown field "pass_threshold"`.
- The sibling `gh-student` CLI does the opposite on purpose: it decodes into a
  partial struct with a plain `json.Unmarshal` and lets unrecognized fields
  decode silently, "so future shape additions work without a flag day."
- The schema-id sentinel (`…/v1`) only guards **major** (v1 -> v2) breaks. It
  says nothing about additive fields _within_ v1, which is exactly the change we
  wanted to make.

So a routine "add an optional field" turned into a cross-binary release-ordering
problem: the strict, round-tripping consumer turns every additive v1 field into
a coordinated, lockstep release unless we change how the field is written, how
it is shipped, and ultimately how the shared parser reads.

## Guidance

**When you add a field to a schema shared across independently-shipped tools,
(a) match the contract's existing field conventions, (b) advance the leading
client behind an opt-in/omitempty write while coordinating laggards via tracked
issues, and (c) make the shared parser forward-compatible — tolerate AND
_preserve_ unknown fields — so additive changes stop being flag days.**

### 1. Match the contract's house style for the new field

Don't invent a shape; mirror the conventions already in the schema so the field
looks native to every consumer that has to grow into it. For this contract the
observed house style is:

- **snake_case** JSON tags.
- Optional scalars are plain Go `int` with `omitempty` and `0` as the unset
  sentinel — **not** pointers, **not** floats. The grading model is all integers,
  so a float would be foreign.
- Ranges are validated by an explicit `Validate…` func on the Go side, mirrored
  by `minimum`/`maximum` in the JSON schema.

So `pass_threshold` is a snake_case `int`, `omitempty`, an integer percentage
constrained to `0–100`. Model it on the existing `max_group_size` field, which
the schema explicitly documents as an advisory "contract field … clients such as
the GUI can display and (optionally) enforce client-side." That makes a
CLI-known-but-CLI-unenforced field an already-blessed pattern on this
contract, not a novelty — the new field has precedent to point at.

### 2. Advance the leading client first; coordinate the laggard with tracked issues, not a blocking release

The web app is the leading client here and the feature is genuinely web-first
(it drives the gradebook UI). Ship the write from the web app — but only the
**conditional, omitempty** write (see §5) — and coordinate the CLI with tracked
issues rather than holding the feature hostage to a lockstep release: we filed
`#199` (model the field in the CLI struct) and `#200` (the general
forward-compatible-parsing fix). Web-first is safe _because_ the write is
conditional and rare; if it were written eagerly on every save, web-first would
be reckless.

### 3. The durable fix is forward-compatible parsing, not per-field lockstep

Per-field coordination doesn't scale: every future additive field repeats the
same flag day. The durable fix is to relax the strict parser to **tolerate /
ignore (or warn-and-continue on) unknown fields** — exactly what `gh-student`
already does — so additive v1 fields stop being breaking changes by
construction. Strict "reject unknown fields" parsing is the root cause, not
`pass_threshold` specifically.

### 4. Critical caveat: tolerate-on-read is NOT enough for a tool that round-trips the file

This is the trap that makes the naive "just relax the decoder" fix dangerous.
If unknown fields decode to _nothing_, then a tool that re-serializes the file —
like `gh teacher assignment add` — will **silently ERASE** the newer client's
field on its next write. You traded a loud failure for silent data loss, which
is worse.

Forward-compatible parsing on a round-tripping tool must therefore also
**preserve and re-emit** unknown fields. Two acceptable shapes:

- Decode into the typed struct **and** a sidecar `map[string]json.RawMessage`
  capturing everything unrecognized, then merge the sidecar back in on
  serialize; or
- Land the field directly in the typed struct (so the round-trip carries it
  naturally) — which is `#199` and the simplest fix for a _known_ field.

Tolerate-on-read handles fields the CLI never expects; preserve-on-write is what
keeps a round-trip from dropping them.

### 5. Shrink the break surface: opt-in / off-by-default

Make the feature opt-in and off by default so the new field is written **only**
when a teacher deliberately enables `pass_threshold`. With an `omitempty`
conditional write, the file is byte-for-byte unchanged for everyone who hasn't
turned the feature on, so the strict-parser hazard only materializes on
deliberate, rare use — buying time for the CLI to catch up without a coordinated
release and without stranding the common case.

## Why This Matters

Without this pattern, the obvious shortcuts each fail:

- **Just write the field (eager, web-first).** The next `gh teacher assignment
add` round-trips the file, hits `DisallowUnknownFields`, and dies with
  `json: unknown field "pass_threshold"`. The teacher's CLI is now broken by a
  web feature they may not even be using.
- **Block the web feature until the CLI ships the field in lockstep.** This
  re-imposes a flag day for a single optional field, and does nothing for the
  _next_ additive field — the cost recurs forever.
- **Relax the CLI decoder to ignore unknown fields, and stop there.** Reads stop
  failing, but the very next CLI write re-serializes without the field and
  **silently erases** the teacher's `pass_threshold`. The loud error becomes
  invisible data loss.
- **Treat the schema id as the compatibility gate.** The `…/v1` sentinel only
  trips on major bumps; it gives no protection for additive v1 fields, so it
  lulls you into thinking the version tag has you covered when it does not.

The combination is what works: an opt-in `omitempty` write shrinks the blast
radius to deliberate use, tracked issues unblock the leading client without a
release train, and a tolerate-**and**-preserve parser converts the entire class
of additive changes from flag days into no-ops.

## When to Apply

- Any JSON/CSV/config file that is read or written by **more than one
  independently-shipped tool or binary**, where you want to add an optional
  field.
- Whenever at least one consumer parses **strictly**
  (`DisallowUnknownFields`, `additionalProperties: false`, a strict struct
  decoder) — and **especially** when that consumer **round-trips** the file
  (decode, mutate, re-serialize), where tolerate-on-read alone causes silent
  field erasure.
- Whenever a schema carries a version sentinel and you're tempted to assume it
  guards additive changes — confirm whether it gates only major bumps.
- Whenever one client leads a feature and another lags: prefer advancing the
  leader behind an opt-in/omitempty write plus tracked laggard issues over a
  coordinated lockstep release.

The reusable recipe: read the strictest consumer first; match its field
conventions; write the new field `omitempty` and only on opt-in; file issues to
model the field and to make the shared parser forward-compatible; and ensure
forward-compat means tolerate **and** preserve, never just tolerate.

## Examples

**Strict decoder (the hazard) vs the tolerant sibling (the target):**

```go
// gh-teacher (STRICT) — also ROUND-TRIPS the file on `assignment add`.
// An unknown field both fails the read AND, if naively relaxed, gets dropped
// on the re-serialize.
dec := json.NewDecoder(r)
dec.DisallowUnknownFields()
if err := dec.Decode(&doc); err != nil {
    return err // json: unknown field "pass_threshold"
}

// gh-student (TOLERANT) — unrecognized fields decode silently, on purpose,
// "so future shape additions work without a flag day."
var partial StudentView
_ = json.Unmarshal(raw, &partial) // unknown fields ignored
```

**The opt-in, omitempty conditional write (web only writes when enabled):**

```ts
// pass_threshold is written ONLY when the teacher turned the feature on.
// Off-by-default + omitempty => the file is unchanged for everyone else,
// so the strict-parser hazard only fires on deliberate use.
const assignment = {
  ...base,
  ...(passThreshold != null ? { pass_threshold: passThreshold } : {}),
}
```

```go
// Matching Go shape on the contract's house style: snake_case, plain int,
// omitempty, integer percent, range-validated to mirror the JSON schema.
type Assignment struct {
    // …
    PassThreshold int `json:"pass_threshold,omitempty"` // 0 = unset; 0–100
}

func (a Assignment) Validate() error {
    if a.PassThreshold < 0 || a.PassThreshold > 100 {
        return fmt.Errorf("pass_threshold must be 0-100, got %d", a.PassThreshold)
    }
    return nil
}
```

**The recommended forward-compat shape — tolerate AND preserve on round-trip:**

```go
// Decode known fields into the typed struct AND capture everything unknown in
// a sidecar, then merge it back on serialize so a round-trip never drops a
// newer client's field. This is what tolerate-on-read alone fails to do.
type Assignment struct {
    Name          string `json:"name"`
    MaxGroupSize  int    `json:"max_group_size,omitempty"`
    PassThreshold int    `json:"pass_threshold,omitempty"`

    Unknown map[string]json.RawMessage `json:"-"` // fields this binary doesn't model
}
// On decode: route unrecognized keys into Unknown (no DisallowUnknownFields).
// On encode: emit the typed fields, then splice Unknown back in verbatim.
```

**Generalizable rule:** when you add a field to a schema shared across
independently-shipped tools, (a) match the contract's existing field
conventions, (b) prefer advancing the leading client behind an opt-in/omitempty
write while coordinating laggards via tracked issues, and (c) make the shared
parser forward-compatible — tolerate **and** preserve unknown fields — so
additive changes stop being flag days. Strict "reject unknown fields" parsing
turns every additive field into a coordinated release; and on a tool that
round-trips the file, tolerate-without-preserve turns it into silent data loss.

## Related

- `docs/solutions/architecture-patterns/serverless-github-identity-reconciliation.md` — §5 states the cross-binary data-contract rule for `students.csv` (preserve unknown columns verbatim); this learning is the JSON analogue (preserve unknown fields verbatim) and adds the strict-parser / round-trip-erasure caveat. The closest existing doc — this is its schema-evolution specialization.
- `docs/solutions/architecture-patterns/forward-only-cross-binary-repo-name-contract.md` — the **name** contract in the same cross-binary family; this is the **data/schema** contract variant, where the failure mode is strict-parser flag days rather than reverse-parse drift.
- `docs/solutions/developer-experience/capability-url-drift-protected-classroom-publishing.md` — the **path** contract sibling; together the four (data, schema-evolution, name, path) form the cross-binary-contract cluster.
