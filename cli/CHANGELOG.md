# Changelog

All notable changes to the Classroom 50 CLI extensions are documented here.
The web app has its own release track and is not covered by this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

Releases are automated with
[release-please](https://github.com/googleapis/release-please): feature PRs
merge into `main` and release-please maintains a release PR that bumps
`cli/CHANGELOG.md` from [Conventional Commits](https://www.conventionalcommits.org/)
(`feat:` -> minor, `fix:` -> patch, `feat!:`/`fix!:` -> major). Merging that
release PR tags `cli-vX.Y.Z`, which the existing CLI release workflow consumes
to build and publish the `gh-teacher` and `gh-student` extensions.

## [1.6.0](https://github.com/foundation50/classroom50/compare/cli-v1.5.0...cli-v1.6.0) (2026-07-15)

### Features

* grant TA (staff) teams repo access during score collection ([#244](https://github.com/foundation50/classroom50/issues/244)) ([3c5b369](https://github.com/foundation50/classroom50/commit/3c5b369d790da97dc25b890767a1127234426e7f))
* grant students push (not admin) on individual assignment repos ([#231](https://github.com/foundation50/classroom50/issues/231)) ([052ce36](https://github.com/foundation50/classroom50/commit/052ce360eca39f4e90dcc981abc000d3ae9df627))

### Bug Fixes

* tolerate a malformed pre-existing roster.csv row on write ([#267](https://github.com/foundation50/classroom50/issues/267)) ([3242505](https://github.com/foundation50/classroom50/commit/3242505baa548ef3790ae0b6f4e4b72b537b2a0d))
* keep classroom creator on the instructor team only ([#243](https://github.com/foundation50/classroom50/issues/243)) ([511d3f0](https://github.com/foundation50/classroom50/commit/511d3f0fcc5f6b85a41db1ce5b11f199c475de6d))
