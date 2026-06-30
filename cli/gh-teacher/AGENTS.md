# AGENTS.md — gh-teacher

Instructor `gh` CLI extension (Go, `go-gh` + `cobra`). Module
`github.com/foundation50/gh-teacher`. See the repo-root `AGENTS.md` for
cross-cutting rules.

## Build & test

```
cd cli/gh-teacher
go build ./...          # or: go build .  (then `gh extension install .` once)
go test ./...
golangci-lint run
```

Set `GH_DEBUG=api` to log every REST request/response.

## Layout

Standard Go CLI layout — thin Cobra command shells over `internal/<domain>/`
behavior packages:

- `main.go` + `init*.go` + `autograder_cmd.go`/`autograder_crud.go` stay at the
  **root `package main`**. This is a deliberate **embed terminus**, not debt:
  `//go:embed` can't cross directories and `package main` is unimportable from
  `internal/*`, so the `//go:embed`-bearing files (`init_skeleton.go` →
  `skeleton/`, `autograder_cmd.go` → `embed/autograder.py`) are pinned to root,
  and their sibling command files stay with them. Don't try to "finish" moving
  them into `internal/`.
- `internal/githubapi/` is the **only** importer of `go-gh/v2/pkg/api` — the
  transport-verb `Client` seam. Test domain logic against the `githubtest` fake.
- `internal/<domain>/` (assignment, classroom, roster, autograder, download,
  configrepo, …) hold the behavior; `internal/validate` the shared rules;
  `internal/output`/`internal/ui` the stderr-summary/`--json`/`--quiet`
  conventions.

## This binary owns the contracts

- The strict `assignments.json` parser and the typed contract structs live here
  (`internal/assignment`, `internal/configrepo`). It **round-trips** the file,
  so unknown fields must be tolerated AND preserved (`AssignmentEntry.Extra`) —
  never dropped.
- The skeleton committed by `gh teacher init` is `skeleton/dotgithub/`
  (rewritten `dotgithub/` → `.github/` at commit time). The web bundles the same
  tree; keep both in sync and the parity tests green. The embed/walk skips
  `__pycache__`/`.pyc`.
- Schema sentinels and shared constants come from `cli/shared/contract`; mirror
  any change into `schemas/*.schema.json` and the Python skeleton scripts.

## Don't

- Don't add a direct `go-gh/api` import outside `internal/githubapi`.
- Don't change a CLI's output bytes / exit codes / `--json` shape without
  updating the tests that pin them (the suite is the behavior oracle).
- Document new commands/flags on the wiki (`wiki/`), not in `README.md`.
