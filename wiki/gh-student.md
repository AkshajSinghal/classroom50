# `gh student` reference

Complete reference for the student CLI. For a step-by-step walkthrough, see the [Student Guide](Student-Guide).

Run `gh student <command> --help` for the live flag list. Errors always go to stderr with a non-zero exit code. Pass `--verbose` / `-v` to any command to see per-step operational details (repo creation, collaborator updates, metadata writes, `git` activity).

## Commands at a glance

| Command | Description |
| --- | --- |
| `gh student whoami` | Print the authenticated GitHub user. |
| `gh student login` | Log in to GitHub via `gh auth login`, requesting `read:org` and `repo` (required for accepting assignments). Pass `-s` to add other scopes. Other commands trigger this same login flow automatically when no token is configured for `github.com`. |
| `gh student logout` | Log out of GitHub via `gh auth logout`. |
| `gh student accept <org> <classroom> <assignment>` | Accept an assignment: auto-accept any pending org invite, create a private repo from the template, add the student as `maintain`, write `.classroom50.yml`, and print clone instructions. |
| `gh student invite <org>/<repo> <user>` | Invite a classmate or TA to the repo with `push` permission. |
| `gh student submit` | Snapshot the current branch and push it as a new commit on top of the assignment repo's `main` branch (after fetching the instructor's `.gitignore` and `.github/` from the template). |

## `gh student accept`

```sh
gh student accept <org> <classroom> <assignment>
```

Creates a private copy of the assignment template repo for the student under `<org>/<classroom>-<assignment>-<username>` (lowercased), then prints a `git clone` command.

Under the hood:

1. If the student has a pending org invitation, auto-accept it via `PATCH /user/memberships/orgs/{org}` with `{"state": "active"}` ([docs](https://docs.github.com/en/rest/orgs/members?apiVersion=2026-03-10#update-an-organization-membership-for-the-authenticated-user)).
2. Create a private repo called `<classroom>-<assignment>-<username>`, **canonicalized as lowercase**, in `<org>` using the assignment's repo template, via `POST /repos/{template_owner}/{template_repo}/generate` ([docs](https://docs.github.com/en/rest/repos/repos?apiVersion=2026-03-10#create-a-repository-using-a-template)). Issues, projects, and the wiki are disabled by default. If the repo already exists (HTTP 422 already-exists), short-circuit with `Assignment already accepted: <org>/<repo>` rather than touching the existing repo.
3. Add `<username>` as a `maintain` collaborator via `PUT /repos/{owner}/{repo}/collaborators/{username}` ([docs](https://docs.github.com/en/rest/collaborators/collaborators?apiVersion=2026-03-10#add-a-repository-collaborator)). The PUT is upsert: a single call covers both the initial add and the downgrade from the creator-default `admin` to `maintain`.
4. Create a `.classroom50.yml` file on the template's default branch via `PUT /repos/{owner}/{repo}/contents/{path}` ([docs](https://docs.github.com/en/rest/repos/contents?apiVersion=2026-03-10#create-or-update-file-contents)) containing:
   - `classroom`
   - `assignment`
   - `source.owner` / `source.repo` / `source.branch` (the template repo's default branch is looked up at accept time, so master/develop templates round-trip correctly).
5. Print the `git clone` command, with a warning if the student is currently inside a git repo (to avoid an accidental nested clone).

`<classroom>` is currently a free-form label the CLI just records in `.classroom50.yml` as `classroom`; it isn't validated against any GitHub concept, so any non-empty string works. Pick a stable name your class agrees on (e.g. `cs50-fall-2026`) since it'll persist in metadata for downstream tooling.

Re-running on an already-accepted assignment short-circuits with `Assignment already accepted: <org>/<repo>` and leaves the existing repo (and any work in it) alone.

## `gh student invite`

```sh
gh student invite <org>/<repo> <username>
```

Invites a classmate or TA to a repo with `push` permission. Calls `PUT /repos/{owner}/{repo}/collaborators/{username}` ([docs](https://docs.github.com/en/rest/collaborators/collaborators?apiVersion=2026-03-10#add-a-repository-collaborator)).

## `gh student submit`

```sh
gh student submit
```

Run from inside a cloned assignment repo. Snapshots the current working tree and pushes it as a new commit on top of the assignment repo's `main` branch (hardcoded for now — templates whose default branch is `master`/`develop` end up with a separate `main` after first submit).

Under the hood:

1. Read `.classroom50.yml` from the local clone for `source.owner`, `source.repo`, and `source.branch`.
2. Copy tracked + untracked-not-ignored files from the working tree into a temp worktree so the submission isn't polluted by build artifacts or unrelated state.
3. Fetch the latest instructor `.gitignore` and `.github/` (if present) from `source.owner/source.repo@source.branch` via `GET /repos/{owner}/{repo}/contents/{path}` ([docs](https://docs.github.com/en/rest/repos/contents?apiVersion=2026-03-10#get-repository-content)).
4. `git clone --bare` the remote, stage the temp worktree on top of the existing `main`, commit the snapshot, and push as a fast-forward. Submissions overlay as commits on top of existing history rather than force-pushing, so prior commits stay reachable for review.

The commit is authored with the user's GitHub login and noreply email (`<id>+<login>@users.noreply.github.com`), passed via `git -c user.name=... -c user.email=...` so a fresh shell with no global `git config` user identity still submits cleanly. `GIT_AUTHOR_*` / `GIT_COMMITTER_*` environment variables override these defaults.

## `gh student whoami` / `login` / `logout`

- `gh student whoami` — prints the authenticated GitHub user.
- `gh student login` — runs `gh auth login -s read:org -s repo`, optionally with additional scopes via `-s/--scope`.
- `gh student logout` — runs `gh auth logout`.

## Contributing

Building, testing, and linting the extension is documented in the [`cli/gh-student/` README](https://github.com/foundation50/classroom50/blob/main/cli/gh-student/README.md) in the repo (where contributors expect to find it).
