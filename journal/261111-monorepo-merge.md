# Monorepo merge: journal-server + journal-webapp → journal

**Date:** 2026-11-11

## What changed

`johnmathews/journal-server` and `johnmathews/journal-webapp` became one repo, `johnmathews/journal`, with `server/` and
`webapp/` subfolders and both full histories. The local folder `/Users/john/projects/journal`, which used to hold the
two repos side by side, is now this repo's root.

- Source commits: journal-server `798b969`, journal-webapp `cf347c0` (both `main` on 2026-11-11, frozen until archive).
- History: `git filter-repo --to-subdirectory-filter` on fresh clones, joined with `--allow-unrelated-histories`
  (merge commits `8d74483` for `server/`, `7b72b37` for `webapp/`). Every commit survives, with new SHAs.
- Tooling: PR #1 (`b54ece4`).

## Decisions

- **New repo, old ones archived.** Renaming `journal-server` was rejected: it rewrites a live `main` and gives no clean
  way to back out.
- **History rewritten into subfolders**, not a single `git mv` commit. Per-path history needs no `--follow`. The cost
  is that SHAs and PR numbers from before today refer to the archived repos.
- **Image names unchanged** (`journal-server`, `journal-chromadb`, `journal-webapp`), built from `server/` and `webapp/`
  contexts. Prod compose needs no edit. The root `CLAUDE.md` records this as an exception to the global
  `<repo-name>` image rule.
- **Two path-filtered workflows** (`server.yml`, `webapp.yml`) instead of one combined workflow. Each part keeps its own
  pipeline and images, and only rebuilds when its folder (or `contract/`) changes.
- **One tracked hook** (`.githooks/pre-push`) replaces husky and the server's untracked `.git/hooks/pre-push`. It runs
  each part's checks only when that part's code changed. `npm install` in `webapp/` sets `core.hooksPath`.
- **Docs and journals stay per part.** The root `docs/` and `journal/` hold only cross-cutting material.
- **The cutover happened in place.** The two nested `.git` folders moved to
  `/Users/john/projects/journal-premerge-git/`, and a fresh clone's `.git` took their place. Ignored local state
  (`.env`, databases, `.venv`, `node_modules`) never moved.

## Surprises

- **Stale local clones.** The local clones were 2 and 4 commits behind GitHub. Running filter-repo on them would have
  dropped those commits; fresh clones avoided it.
- **Gitlinks.** `git add` at the parent with nested `.git` folders present records gitlinks instead of files.
  Reproduced in scratch, and avoided by building in a separate clone.
- **pip-audit on the first PR.** pip-audit failed PR #1 on `pyasn1` 0.6.4 (four CVEs). This was pre-existing: the old
  repo's Dependabot PR #96 had sat unmerged since 5 November. Bumped to 0.6.5 in the same PR.
- **Path filters on PRs.** On `pull_request` events, path filters compare the whole PR against its base, not each
  push. A PR touching both parts runs both workflows on every push.
- **GHCR access.** The three image packages were linked to the old repos. `johnmathews/journal` had to be granted
  Actions write access on each (done in the GitHub UI) before the first `main` build could push.

## Follow-ups

- Archive the old repos, transfer their 8 open issues, close their Dependabot PRs, and repoint the docs server sources
  (`home-server` `docserver-sources.yml.j2`).
- Deploy the first images built from `journal` to `media`, and confirm the revision label.
- API contract check (`contract/api.schema.json`, generated TS types, runtime response checks in server tests), which
  fixes the known server/webapp type drift. The first defect it targets: the relationships endpoint omits the entity
  names the entity page renders.
- Delete `/Users/john/projects/journal-premerge-git/` once the old repos are archived and a week has passed without
  needing it.
