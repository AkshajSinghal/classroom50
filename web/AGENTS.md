# AGENTS.md — web

Teacher GUI: React 19 + TypeScript + Vite (React Compiler on), TanStack
Router/Query, Tailwind + daisyUI. 100% client-side over the GitHub API — no
backend. Deployed to classroom50.org via GitHub Pages. See the repo-root
`AGENTS.md` for cross-cutting rules.

## Build & test

```
cd web
npm run check          # tsc -b + eslint + prettier --check + vitest run
npm run dev            # local dev (http://localhost:5173)
```

`tsc -b` must pass — the deploy build type-checks and a regression fails the
deploy. Requires `.env.local` with `VITE_GITHUB_CLIENT_ID` (gitignored).

## Contract mirrors (hand-kept in lockstep with `schemas/`)

`schemas/*.schema.json` is the source of truth; this app hand-mirrors it:

- `src/types/classroom.ts` — `Assignment`/`Classroom` (assignments-v1,
  classroom-v1). Enum fields use unions (e.g. `AssignmentMode`), not bare
  `string`. Preserve entry-level keys the form doesn't manage (e.g.
  `migrated_from`, unknown future keys) on a read-modify-write.
- `src/util/yaml.ts` — the zod schema for `.classroom50.yaml` (repo-config-v1).
- `src/util/secret.ts`, `src/util/assignmentTests.ts`, `src/util/allowedFiles.ts`
  — secret pattern, declarative-test bounds, allowed-files parity.
- `src/hooks/useGetScores.ts` — scores-v1 reader.

When a web change needs a schema change, update `schemas/` first, then the
mirror (web-priority). Keep tolerate-and-preserve for unknown fields.

## Skeleton (bundled, not fetched)

`src/skeleton/skeleton.ts` bundles the canonical skeleton from
`cli/gh-teacher/skeleton/dotgithub` via an eager raw Vite glob and commits it
into `<org>/classroom50/.github/` at org setup. **No runtime fetch from the CLI
repo.** Rules:

- `skeleton.test.ts` is the drift guard. `vite build` does NOT fail on a glob
  that matches fewer files, so the test (and `buildSkeletonFiles`' throw) is the
  only thing that catches a renamed/removed skeleton file. Keep it green.
- `vite.config.ts` `server.fs.allow` includes the repo root so dev mode can read
  the out-of-root skeleton.
- web-ci and web-deploy are triggered/gated on the skeleton source too; don't
  remove those paths.

See `docs/solutions/architecture-patterns/monorepo-synchronized-release-web-priority-bundled-skeleton.md`.

## Conventions

- `requestRaw` is for raw GitHub content; `request` for JSON. GitHub writes go
  through the git-data API (blob/tree/commit/ref) helpers in `src/hooks/github/`.
- Captured learnings live in `web/docs/solutions/`.
- Prettier + eslint are enforced; run `npm run format` before committing.

## Don't

- Don't reintroduce a remote skeleton fetch from `foundation50/classroom50`.
- Don't write unknown/`null` keys into `assignments.json` — the teacher CLI
  rejects them and breaks `gh teacher` for the whole classroom.
- Don't commit `dist/`, `node_modules/`, or `.env.local`.
