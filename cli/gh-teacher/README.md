# gh-teacher

A `gh` CLI extension targeted at instructors. Written in Go using [`go-gh`](https://github.com/cli/go-gh) and [`cobra`](https://github.com/spf13/cobra).

## Local development

First-time setup:

```
cd cli/gh-teacher
go mod tidy
```

Build and register as a `gh` extension from your local checkout:

```
go build .
gh extension install .
```

After that, `gh teacher --version` and `gh teacher whoami` are available. Re-run `go build .` after code changes; `gh extension install .` only needs to run once.

## Local checks

Install Go and `golangci-lint` once:

```
brew install go golangci-lint
```

Run all CI checks locally before pushing:

```
gofmt -w . && go mod tidy && golangci-lint run && go build ./...
```

If that exits 0, CI will pass. The same checks run in [`gh-teacher-ci.yml`](../../.github/workflows/gh-teacher-ci.yml).

VSCode users: install the [Go extension](https://marketplace.visualstudio.com/items?itemName=golang.Go) and add this to `.vscode/settings.json` for format-and-lint on save:

```json
{
  "go.lintTool": "golangci-lint",
  "go.lintOnSave": "package",
  "go.formatTool": "gofmt"
}
```

## Layout

Single `main.go` with a cobra root command and inline subcommands. Split into separate files (or a `cmd/` package) when individual commands grow non-trivial.

## Distribution

Currently install-from-source only. Cross-platform binary releases via [`cli/gh-extension-precompile`](https://github.com/cli/gh-extension-precompile) are deferred until this extension lives in its own repository (`gh extension install <owner>/<repo>` resolves the binary by repo name, which only matches once `gh-teacher` is the repo).
