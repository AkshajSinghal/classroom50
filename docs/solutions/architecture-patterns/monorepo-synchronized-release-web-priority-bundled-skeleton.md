---
title: "Monorepo synchronized release: web-priority schemas and a GUI that bundles the CLI-owned skeleton"
date: 2026-06-30
category: architecture-patterns
module: web
problem_type: architecture_pattern
component: cross-binary-contract
severity: medium
applies_when:
  - "Two independently-built clients (a Go CLI and a web GUI) live in one monorepo and now ship at the same time"
  - "A web client was fetching scaffolding/skeleton files from the OTHER client's published repo at runtime"
  - "A JSON schema is hand-mirrored across JSON Schema, Go, Python, and TypeScript and you must decide who leads on change"
  - "//go:embed pins an asset tree to a directory and a web bundler also needs the same files"
tags:
  - monorepo
  - cross-binary-contract
  - schema-evolution
  - web-priority
  - go-embed
  - vite
  - skeleton-ownership
related_docs:
  - "docs/solutions/architecture-patterns/embed-terminus-and-build-as-oracle-in-go-package-extraction.md (why the skeleton must physically stay next to the Go file that embeds it)"
  - "web/docs/solutions/architecture-patterns/evolving-strict-cross-binary-schemas.md (the PRE-monorepo lockstep model this supersedes for the synchronized-release case)"
---

# Monorepo synchronized release: web-priority schemas and a GUI that bundles the CLI-owned skeleton

## Context

`classroom50-cli` became a monorepo: the Go CLIs (`cli/`) and the web GUI
(`web/`) now live together and are published at the same time. Two facts about
the pre-monorepo world stopped being true and changed the right design:

1. **The clients no longer ship independently.** The lockstep-avoidance dance in
   `evolving-strict-cross-binary-schemas.md` (advance the web first, coordinate
   the CLI with tracked issues, never a flag day) existed because the web app
   and the CLI released on different trains. In a synchronized release the
   skeleton, contracts, and schemas in a given commit are by construction
   aligned — there is no laggard to coordinate with for changes that go out
   together.

2. **The GUI was fetching the skeleton from the CLI's public mirror at
   runtime.** The deployed SPA read `cli/gh-teacher/skeleton/dotgithub/*` from
   `foundation50/classroom50@main` (the mirror) via the GitHub Contents API at
   org-setup time, then committed those files into the teacher's config repo.
   That coupled every deploy to (a) the mirror-to-public sync having run and (b)
   the mirror tracking the exact schema/contract version the SPA expected — a
   fragile cross-repo runtime dependency for files that already live in the same
   monorepo.

## Guidance

**In a synchronized-release monorepo, make the web the priority writer for
schema changes (CLI follows), and have the GUI BUNDLE the CLI-owned skeleton
into its own deploy artifact instead of fetching it from the other client's
repo at runtime — keeping a single physical source of truth that the build
guards against drift.**

### 1. Web-priority, not web-only

When a web-side change needs a schema update, update the schema (and the TS
mirror) immediately and let the CLI follow in the same release. "Web priority"
replaces "advance the leader behind an opt-in/omitempty write and file laggard
issues": with a shared release there is no window where a reader is behind a
writer, so the conditional/omitempty hedging is no longer required for
co-shipped changes. Keep the **tolerate-AND-preserve** rule regardless (see §4)
— it protects against documents written by an *older deployed* release still in
the wild, which a synchronized build does not eliminate.

### 2. The skeleton has ONE physical source, pinned by `//go:embed`

`//go:embed` cannot reference a parent directory, and `package main` is
unimportable from `internal/*`, so the embedded skeleton tree must physically
sit next to the Go file that embeds it (`cli/gh-teacher/skeleton/`). That is a
permanent terminus, not debt (see the embed-terminus learning). So "the GUI
owns the skeleton" cannot mean "move the files under `web/`." It means: keep the
one canonical copy where the CLI can embed it, and let the GUI **read that same
copy at build time**.

### 3. The GUI bundles the skeleton via the bundler, not the network

A web bundler (Vite/Rollup) can import files from outside its project root.
Compile the canonical skeleton into the JS bundle with an eager raw glob:

```ts
// web/src/skeleton/skeleton.ts — relative path escapes the web/ root to the
// single canonical copy the CLI also embeds.
const rawModules = import.meta.glob<string>(
  [
    "../../../cli/gh-teacher/skeleton/dotgithub/**/*.yaml",
    "../../../cli/gh-teacher/skeleton/dotgithub/**/*.py",
  ],
  { query: "?raw", import: "default", eager: true },
)
```

Now the deployed site at the custom domain carries the exact skeleton bytes that
shipped with it; org setup commits them from memory. No `@main` runtime fetch,
no dependency on the mirror sync. Two build-time gotchas to handle:

- **Dev server file access.** `vite build` inlines the files regardless, but the
  dev server restricts reads to the project root; add the monorepo root to
  `server.fs.allow` so `npm run dev` can read the out-of-root skeleton too.
- **Scope the glob to real source extensions** (`*.yaml`, `*.py`), not `**/*`.
  A broad glob also sweeps in Python's `__pycache__/*.pyc` (which is not
  dot-prefixed, so it is NOT filtered the way dotfiles are) and bloats the
  bundle. The same un-filtered `__pycache__` is a latent bug on the CLI side too
  — `//go:embed skeleton` walks it, so the embed/walk must skip `__pycache__`
  and `.pyc` or it commits bytecode into every config repo.

### 4. Guard the single source against silent drift with a build-time parity test

One physical copy removes *content* drift, but the GUI deploys a deliberate
*subset* of the skeleton and substitutes a `{{DEFAULT_BRANCH}}` placeholder. A
vitest parity test asserts every path the GUI declares resolves to a bundled
file and the placeholder is substituted — so a renamed/removed skeleton file
fails the build instead of producing a config repo that 404s a missing
workflow/script at the first student submission. Keep the typed `Assignment`
mirror honest too: constrain enum fields (`mode`) to the schema's union rather
than bare `string`, and preserve entry-level keys the form doesn't manage
(e.g. `migrated_from`) on a read-modify-write, or the GUI silently drops them.

## Why This Matters

- **Runtime cross-repo fetch is fragile and invisible until setup time.** If the
  mirror is stale or unreachable, org setup fails (or worse, writes a
  half-skeleton) — for files that were sitting in the same monorepo all along.
  Bundling makes the skeleton a build artifact, so a broken skeleton fails CI,
  not a teacher's first onboarding.
- **Synchronized release dissolves the laggard problem but not the
  old-document problem.** Dropping lockstep hedging for co-shipped changes is
  correct; dropping tolerate-and-preserve is not, because documents written by a
  previously deployed release still exist.
- **The embed terminus is load-bearing.** "Move the skeleton under the owner"
  is the obvious wrong turn; `//go:embed`'s no-parent rule makes the canonical
  copy's location non-negotiable, and the bundler — not a file move — is what
  lets a second client own its deployed copy.

## When to Apply

- A monorepo with more than one independently-built client that now ships on one
  train, where one client was fetching the other's assets at runtime.
- Any time a web bundle needs files that a Go binary `//go:embed`s: bundle them
  from the canonical location rather than relocating the embed tree.
- Whenever a single source of truth is consumed by clients with different
  packaging (compiled-in vs embedded): add a build-time parity test, because
  "one copy" still drifts via subsets, placeholders, and type mirrors.
