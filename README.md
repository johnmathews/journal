# Journal

Personal journal insight engine. It ingests handwritten pages (OCR) and voice notes (transcription), stores them in
SQLite and ChromaDB, and answers questions through an MCP server, a REST API, a CLI and a web app.

| Folder | What it is | Docs |
| --- | --- | --- |
| [`server/`](server/) | Python 3.13 backend: MCP server, REST API, CLI (uv, pytest) | [`server/README.md`](server/README.md), [`server/docs/`](server/docs/) |
| [`webapp/`](webapp/) | Vue 3 + TypeScript frontend (Vite, Vitest, Tailwind) | [`webapp/README.md`](webapp/README.md), [`webapp/docs/`](webapp/docs/) |
| [`test-data/`](test-data/) | Fictional sample entries for local ingestion tests | |

This repo was created on 2026-11-11 by merging `johnmathews/journal-server` and `johnmathews/journal-webapp` with full
history. Commit SHAs and PR numbers from before that date refer to those archived repos.

## Setup

Each part has its own toolchain; run its commands from inside its folder.

```bash
cd server && uv sync              # backend
cd webapp && npm install          # frontend; also installs the git hook below
```

The pre-push hook in [`.githooks/pre-push`](.githooks/pre-push) runs the checks for whichever part a push touches.
`npm install` in `webapp/` enables it. Without the webapp toolchain, enable it once by hand:

```bash
git config core.hooksPath .githooks
```

## CI and images

Two GitHub Actions workflows, each filtered to its own folder:

- [`server.yml`](.github/workflows/server.yml): lint, tests, pip-audit, ChromaDB integration tests; on `main` it
  pushes `ghcr.io/johnmathews/journal-server` and `ghcr.io/johnmathews/journal-chromadb`.
- [`webapp.yml`](.github/workflows/webapp.yml): lint, tests with coverage thresholds, build; on `main` it pushes
  `ghcr.io/johnmathews/journal-webapp`.

On the `media` VM, What's Up Docker redeploys `journal-server` and `journal-webapp` within about a minute of a new
`:latest` image, so a green merge to `main` ships to production. `journal-chromadb` updates by hand. See
[`server/docs/production-deployment.md`](server/docs/production-deployment.md).
