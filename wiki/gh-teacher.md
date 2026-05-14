# `gh teacher` reference

Complete reference for the teacher CLI. For a step-by-step walkthrough, see the [Teacher Guide](Teacher-Guide).

Run `gh teacher <command> --help` for the live flag list. Errors always go to stderr with a non-zero exit code. Commands that emit informational output accept `--quiet` / `-q` to suppress it; pass `--verbose` / `-v` to see per-step operational details (e.g. raw `git` output during `download`).

## Commands at a glance

| Command | Description |
| --- | --- |
| `gh teacher whoami` | Print the authenticated GitHub user. |
| `gh teacher login` | Log in to GitHub via `gh auth login`, requesting `admin:org` (required for org invites). Pass `-s` to add other scopes. Other commands trigger this same login flow automatically when no token is configured for `github.com`. |
| `gh teacher logout` | Log out of GitHub via `gh auth logout`. |
| `gh teacher invite <org> <user>` | Invite user to an org (use `--admin` for org admin). |
| `gh teacher invite <org>/<repo> <user>` | Invite user to a specific repo. Default permission `push`; override with `-p {pull,triage,push,maintain,admin}`. Re-running updates the collaborator in place. |
| `gh teacher remove <org> <user>` | Remove user from an org. Revokes access to every repo in the org, removes them from all teams, and cancels any pending invitation. Idempotent. |
| `gh teacher remove <org>/<repo> <user>` | Remove user from a single repo. Idempotent. |
| `gh teacher download <org> <classroom> <assignment>` | Clone every repo in `<org>` whose name starts with `<classroom>-<assignment>-`. Default destination is `<classroom>-<assignment>_submissions_<YYYY_MM_DD_T_HH_MM_SS>/`; override with `-d`. |

## `gh teacher invite`

Uses the API to invite a student or teaching assistant to an org or a specific repo.

```sh
gh teacher invite <org> <username>             # direct_member to org
gh teacher invite --admin <org> <username>     # admin to org
gh teacher invite <org>/<repo> <username>      # collaborator on repo (default push)
gh teacher invite -p maintain <org>/<repo> <username>
```

Under the hood:

1. Resolve the username to a user ID via `GET /users/{username}` ([docs](https://docs.github.com/en/rest/users/users?apiVersion=2026-03-10#get-a-user)).
2. For org targets, invite by user ID via `POST /orgs/{org}/invitations` ([docs](https://docs.github.com/en/rest/orgs/members?apiVersion=2026-03-10#create-an-organization-invitation)).
3. For repo targets, add via `PUT /repos/{owner}/{repo}/collaborators/{username}` ([docs](https://docs.github.com/en/rest/collaborators/collaborators?apiVersion=2026-03-10#add-a-repository-collaborator)).
4. Advise the user to sign in to `https://github.com` as the invited GitHub user, then visit `https://github.com/<org>` to accept.

The org-invitation endpoint requires the `admin:org` OAuth scope. Run `gh teacher login` once before the first org invite to grant it.

Common API failures (missing scope, not an admin, org not found, already a member, pending invite) are translated into actionable messages instead of raw HTTP errors.

## `gh teacher remove`

```sh
gh teacher remove <org> <username>           # remove from organization
gh teacher remove <org>/<repo> <username>    # remove from one repository
```

- Org targets call `DELETE /orgs/{org}/memberships/{username}` ([docs](https://docs.github.com/en/rest/orgs/members?apiVersion=2026-03-10#remove-organization-membership-for-a-user)). Revokes access to every repository in the org, removes the user from all teams, and cancels any pending invitation in one call.
- Repo targets call `DELETE /repos/{owner}/{repo}/collaborators/{username}` ([docs](https://docs.github.com/en/rest/collaborators/collaborators?apiVersion=2026-03-10#remove-a-repository-collaborator)).
- Both forms are idempotent: a `204` prints `removed <username>`; a `404` (user is not a member or collaborator) prints a clear message and exits 0 so re-runs are safe.

## `gh teacher download`

```sh
gh teacher download <org> <classroom> <assignment>              # clones into <classroom>-<assignment>_submissions_<timestamp>/
gh teacher download -d <dir> <org> <classroom> <assignment>     # literal dir, no timestamp
gh teacher download -v <org> <classroom> <assignment>           # stream raw git output per repo
gh teacher download -q <org> <classroom> <assignment>           # suppress per-repo summary, forward --quiet to git
```

Under the hood:

1. Page through `GET /orgs/{org}/repos` ([docs](https://docs.github.com/en/rest/repos/repos?apiVersion=2026-03-10#list-organization-repositories)), collecting every repo whose name starts with `<classroom>-<assignment>-` (matching the `gh student accept` convention `<classroom>-<assignment>-<username>`). The `<classroom>` and `<assignment>` arguments are lowercased before matching so any case works on the input side.
2. For each match, shell out to `gh repo clone <org>/<name> <dir>/<name>` so authentication flows through the current `gh` session — no separate git credential setup needed for private classroom repos.

Default destination is `<classroom>-<assignment>_submissions_YYYY_MM_DD_T_HH_MM_SS/` (24-hour local time) so each run produces a fresh folder and prior downloads are preserved without manual cleanup. Pass `-d` to override (the value is taken literally, no timestamp appended).

Existing target dirs are skipped, so re-runs with the same `-d` pick up new submissions without aborting on the ones already cloned. Failures carry git's actionable diagnostic (e.g. `fatal: ...`) rather than just an exit code, and a non-zero exit code surfaces if any clone failed after the rest still run.

## `gh teacher whoami` / `login` / `logout`

- `gh teacher whoami` — prints the authenticated GitHub user (a thin wrapper around `gh api user`).
- `gh teacher login` — runs `gh auth login -s admin:org`, optionally with additional scopes via `-s/--scope`.
- `gh teacher logout` — runs `gh auth logout`.

## Contributing

Building, testing, and linting the extension is documented in the [`cli/gh-teacher/` README](https://github.com/foundation50/classroom50/blob/main/cli/gh-teacher/README.md) in the repo (where contributors expect to find it).
