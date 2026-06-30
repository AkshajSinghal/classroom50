# AGENTS.md

Agent instructions for the Classroom 50 monorepo. Nearest-file-wins: this is the
repo-wide default; `cli/gh-teacher/`, `cli/gh-student/`, and `web/` carry their
own `AGENTS.md` with stack-specific rules that take precedence there.

## What this is

An open-source GitHub Classroom alternative. 100% client-side: there is no
backend — all state lives in GitHub repos and JSON/CSV/YAML config files. Three
independently-built but co-shipped pieces:

| Area | Stack | Role |
| --- | --- | --- |
| `cli/gh-teacher/` | Go (`gh` extension) | Instructor CLI: org setup, classrooms, roster, autograding, download |
| `cli/gh-student/` | Go (`gh` extension) | Student CLI: accept, submit |
| `cli/shared/` | Go module | Shared contract constants, GitHub-API/auth/git-tree helpers, UI primitives |
| `web/` | React + TS + Vite | Teacher GUI deployed to classroom50.org (GitHub Pages) |
| `schemas/` | JSON Schema | Source-of-truth schemas for the cross-binary contracts |
| `cli/gh-teacher/skeleton/` | YAML + Python | The config-repo scaffolding `gh teacher init` commits and the web bundles |

`go.work` ties the three Go modules together for dev only; each still builds
standalone with `GOWORK=off`.

## Build & test (run before claiming done)

- Go (per module): `cd cli/<mod> && go build ./... && go test ./...`
- Web: `cd web && npm run check` (runs `tsc -b` + eslint + prettier + vitest)
- Python skeleton: `python3 -m pytest cli/gh-teacher/skeleton_tests -q`

## Cross-cutting rules

- **No backend.** Don't add server-side state. Behavior is derived from repos
  and config files (e.g. "accepted" = the student repo exists).
- **Cross-binary contracts are shared.** `schemas/*.schema.json` is the source
  of truth; the Go, Python, and TS sides hand-mirror it. When you touch a
  contract, update the schema AND every mirror, and keep the parity tests green.
  See `CONCEPTS.md` ("Cross-binary contract") and the learnings in
  `docs/solutions/architecture-patterns/`.
- **Web-priority, synchronized release.** The GUI and CLI ship together. When a
  web change needs a schema update, update the schema (and TS mirror) first and
  let the CLI follow in the same release. Still **tolerate AND preserve** unknown
  fields on read-modify-write (older deployed releases wrote older documents).
- **Skeleton has one physical source.** `cli/gh-teacher/skeleton/dotgithub/` is
  canonical (the CLI `//go:embed`s it; the web bundles it via Vite). Don't move
  it or fetch it remotely. See
  `docs/solutions/architecture-patterns/monorepo-synchronized-release-web-priority-bundled-skeleton.md`.
- **Comments explain *why*, not *what*.** Don't narrate the code. Keep them short.
- **Document CLI features on the wiki** (`wiki/`), not in per-extension READMEs.

## Conventions

- Domain vocabulary: `CONCEPTS.md` (single glossary for the whole repo). Use the
  defined terms (Autograder, Declarative test, Submission, Roster, etc.).
- Captured learnings: `docs/solutions/` (and `web/docs/solutions/`). Read the
  relevant one before reworking an area it covers.
- The public repo `foundation50/classroom50` is a downstream **mirror** of this
  repo (`mirror-to-public.yaml`), excluding `web/`. Don't depend on the mirror at
  runtime.

## Don't

- Don't commit secrets (`.env.local`, tokens, deploy keys).
- Don't commit build artifacts or caches (`node_modules/`, `dist/`,
  `__pycache__/`, `.vite/`).
- Don't break output bytes / exit codes / `--json` shapes of the CLIs — the test
  suites are the behavior oracle.
