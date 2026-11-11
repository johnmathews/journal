# GitHub Actions pinned to commit SHAs

**Date:** 2026-10-25
**Branch:** `eng-pin-actions-sha`

## The change

All 6 `uses:` references in `.github/workflows/ci.yml` (5 distinct actions) now name a
40-character commit SHA, with the release tag as a trailing comment. Nothing was upgraded: each
tag was resolved to the commit it pointed at on 2026-10-25, and the comment names the most
specific release tag on that commit.

- `actions/checkout` v5 → v5.1.0 (`fbc6f3992d24`)
- `actions/setup-node` v5 → v5.0.0 (`a0853c245446`)
- `actions/upload-artifact` v7 → v7.0.2 (`cf430e030ddb`)
- `docker/build-push-action` v7 → v7.4.0 (`c3c9e263c25d`)
- `docker/login-action` v4 → v4.7.0 (`81c6f93d4bc9`)

`.github/dependabot.yml` is new, with the `github-actions` ecosystem on a weekly schedule.

## Why

The home server auto-deploys this image: What's Up Docker redeploys the journal webapp within
about a minute of a new `latest` on ghcr (home-server `documentation/wud.md`). The `docker` job
holds a token with `packages: write` and ran `docker/login-action` and
`docker/build-push-action` by major tag. A tag can be moved by whoever controls the action's
repository (the tj-actions/changed-files compromise in 2025 did exactly that), so a hijacked tag
would have pushed a malicious image that deploys itself. A commit SHA cannot be moved.

## Keeping the pins current

Dependabot understands SHA pins: its pull request replaces the SHA and rewrites the version
comment together. Those pull requests are the routine way a pin changes, and merging one
publishes a new `latest`.
