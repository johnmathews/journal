# Journal — monorepo

One git repo (`johnmathews/journal`) holding the Journal Insights and Analysis Tool:

- `server/` — Python backend (MCP server + REST API + CLI). Python 3.13, `uv`, pytest, SQLite + ChromaDB.
- `webapp/` — Vue 3 + TypeScript frontend (Vite, Pinia, Tailwind CSS 4 / Cruip Mosaic shell).

The webapp calls the backend's REST API. In dev, Vite (port 5173) proxies `/api/*` to the server on `localhost:8400`.

Until 2026-11-11 these were two repos, `johnmathews/journal-server` and `johnmathews/journal-webapp` (now archived).
Commit SHAs and PR numbers older than that refer to them.

## Part instructions (auto-imported)

The two lines below import each part's `CLAUDE.md` via Claude Code's `@` import syntax. Keep them on their own lines,
not in a code block.

@server/CLAUDE.md
@webapp/CLAUDE.md

Also consult, when relevant (read on demand): `server/project-brief.md`, `server/docs/`, `webapp/docs/`, and the dated
dev journals in `server/journal/`, `webapp/journal/` and `journal/` (cross-cutting entries).

## Tooling

Run each part's tooling from inside its folder — `uv` and `npm` do not find the project from the root:

- `server/`: `uv sync`, `uv run pytest`, `uv run pytest --cov`, `uv run ruff check src/ tests/`, `uv run journal`,
  `uv run journal contract export`, `docker compose up`
- `webapp/`: `npm run dev`, `npm run build`, `npm run test:unit`, `npm run test:coverage`, `npm run lint`,
  `npm run format`, `npm run contract:gen`, `npm run contract:check`

Use `cd` or a subshell: `(cd server && uv run pytest)`.

## Search scoping

`Glob` and `Grep` from the root search both parts. For one part only, pass `path: "server"` or `path: "webapp"`.
Skip noisy folders: `webapp/node_modules`, `webapp/dist`, `server/htmlcov`, `server/.venv`, `server/journal.db`.

## Git, branches and PRs

- One repo, one `main`. Work on a branch (or a worktree), land by pull request; the `main` ruleset blocks force-push
  and deletion.
- A change that spans both parts (an API contract change, an end-to-end feature) is **one branch and one PR**. Make
  and test the server side first, then update the webapp's API client, types and store in the same branch.
- Run the full suite of every part you touched before pushing. The tracked pre-push hook (`.githooks/pre-push`)
  runs the checks for the parts the push touches and skips prose-only pushes; `npm install` in `webapp/` enables it,
  or run `git config core.hooksPath .githooks` once.

## CI

Two workflows, each triggered only by its own folder (plus `contract/` and the workflow file itself):

- `.github/workflows/server.yml` — ruff, unit tests with coverage, pip-audit, ChromaDB integration tests; on `main`
  pushes the server and chromadb images.
- `.github/workflows/webapp.yml` — eslint, vitest with coverage thresholds, `contract:check`, build; on `main` pushes
  the webapp image.

After pushing, watch the run(s) for the parts you changed (`gh run list -R johnmathews/journal --limit 5`, then
`gh run watch <id>`). Work is not done until CI is green. If CI fails: read the logs, fix, run the suite locally,
push, watch again. After 3 failed fix attempts, flag it to John.

## API contract

Every REST response body is a strict `TypedDict` in `server/src/journal/api/contract/schemas.py`, registered by route
`name=`. It is exported to `contract/api.schema.json`, and the webapp's types are generated from that into
`webapp/src/types/generated/api.ts`. Every server API test validates real 2xx bodies against it, and every
`custom_route` must be registered (`server/tests/contract_allowlist.txt` is empty, ceiling 0).

To change or add a response: edit the `TypedDict`, then `(cd server && uv run journal contract export)` and
`(cd webapp && npm run contract:gen)`, and commit the three files together. Never edit the two generated files by hand.
Workflow, conventions and limits: [`docs/api-contract.md`](docs/api-contract.md).

## Images (deliberate exception to the global naming rule)

This repo publishes **three** images under their historical names, not `ghcr.io/johnmathews/journal`:

- `ghcr.io/johnmathews/journal-server` (from `server/Dockerfile`)
- `ghcr.io/johnmathews/journal-chromadb` (from `server/Dockerfile.chromadb`)
- `ghcr.io/johnmathews/journal-webapp` (from `webapp/Dockerfile`)

Prod's compose file pulls these names. Do not rename them.

## Shipping

- **Lands by:** pull request to `main` (squash-merged).
- **Environments:**
  - images: CI builds and pushes `:latest` and a SHA tag for each image whose part changed on `main`. Check:
    `gh run list -R johnmathews/journal --workflow server.yml --branch main --limit 1` (or `webapp.yml`).
  - production (`media` VM, https://journal.itsa-pizza.com): **`journal-server` and `journal-webapp` deploy
    automatically.** What's Up Docker (WUD) on `media` polls ghcr every minute and recreates either service when its
    `:latest` digest changes, so **a green merge to `main` is a production deploy**, about a minute after the image
    push. `journal-chromadb` is not watched and updates only by hand:
    `ssh media 'cd /srv/media && docker compose pull journal-chromadb && docker compose up -d journal-chromadb'`.
    Check what is running:
    `ssh media 'cd /srv/media && docker inspect -f "{{.Image}} {{.State.StartedAt}}" $(docker compose ps -q journal-webapp)'`
    and compare with the latest `main` CI run. Pausing WUD, rollback and the full runbook:
    `server/docs/production-deployment.md`.

## Bug fix workflow

Write a failing test that reproduces the exact issue first, watch it fail, then fix the code to make it pass. This
applies to bugs found in development, review, CI or production.

## Standing conventions

- Tests live alongside new code and are updated when code changes.
- Docs stay per part (`server/docs/`, `webapp/docs/`); the root `docs/` holds only cross-cutting material. Dev journal
  entries (`yymmdd-name.md`) go in the part's `journal/`, or the root `journal/` when they span both.
- Python: type annotations everywhere, `uv` only, `pytest` + `coverage`.

## Documentation lifecycle

- Prefer shorter docs over long ones, but no hard length cap — let scope and detail required dictate length.
- When a doc is **closed** (all work units shipped) or **superseded** (replaced by a newer doc): add a status header
  (`**Status:** closed YYYY-MM-DD.` or `**Status:** superseded by [...](...) (YYYY-MM-DD).`) to the top of the old doc,
  then `git mv` it into that part's `docs/archive/` in the same commit. Update inbound links from any active docs.
- Closed and superseded docs are kept (they preserve decisions and rationale) but archived, so the active `docs/`
  listing stays scannable.
