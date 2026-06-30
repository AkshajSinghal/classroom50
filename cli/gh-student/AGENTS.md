# AGENTS.md — gh-student

Student `gh` CLI extension (Go, `go-gh` + `cobra`). Module
`github.com/foundation50/gh-student`. See the repo-root `AGENTS.md` for
cross-cutting rules.

## Build & test

```
cd cli/gh-student
go build ./...          # or: go build .  (then `gh extension install .` once)
go test ./...
golangci-lint run
```

Set `GH_DEBUG=api` to log every REST request/response.

## Layout

Same layout as gh-teacher: thin Cobra shells over `internal/<domain>/`
(assignments, accept, submit, identity, localgit, reponame, ignorematch, …),
with `internal/githubapi` the sole `go-gh/api` seam and `internal/ui` the output
renderer. `accept.go` stays at the root `package main` because it
`//go:embed`s `embed/autograde-shim.yaml` (an embed terminus — don't move it).

## Reads the contract loosely, on purpose

Unlike gh-teacher, the student binary parses `assignments.json` into a **partial
struct** and **ignores unknown fields** (no `DisallowUnknownFields`), "so future
shape additions work without a flag day." It types only the fields a student
needs (slug, name, mode, max_group_size, template, autograder, allowed_files).
Keep it that way — don't make it strict.

- `.classroom50.yaml` (repo-config/v1) is written by both this binary and the
  GUI; the shape is a cross-binary contract (`internal/classroomcfg`).
- The student repo-name formula (`internal/reponame`) is a forward-only
  cross-binary contract — construct it in one direction, never reverse-parse it.
  See `web/docs/solutions/architecture-patterns/forward-only-cross-binary-repo-name-contract.md`.

## Don't

- Don't add a direct `go-gh/api` import outside `internal/githubapi`.
- Don't tighten the student-side parser to reject unknown assignment fields.
- Document new commands/flags on the wiki (`wiki/`), not in `README.md`.
