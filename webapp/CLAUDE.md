# Journal Webapp

Vue 3 frontend for the Journal Analysis Tool. Displays journal entries, enables OCR correction, and will include dashboards.

## Project Structure

```
src/
  api/                  — API client layer (fetch wrappers, typed endpoints)
  assets/               — Tailwind entry (main.css) and component classes (utility-patterns.css)
  components/layout/    — Mosaic-derived shell: Sidebar, Header, ThemeToggle
  composables/          — Composition functions (useEntryEditor, etc.)
  layouts/              — DefaultLayout wraps Sidebar + Header + <slot/>
  router/               — Vue Router configuration
  stores/               — Pinia stores (entries, etc.)
  types/                — TypeScript types; API response types are generated (types/generated/api.ts, see ../docs/api-contract.md)
  utils/                — mosaic.ts (CSS/color helpers), chartjs-config.ts
  views/                — Page components (EntryListView, EntryDetailView)
```

## Commands

- `npm run dev` — Start dev server (port 5173, proxies /api to localhost:8400)
- `npm run build` — Type-check and build for production
- `npm run test:unit` — Run unit tests with Vitest
- `npm run test:watch` — Run tests in watch mode
- `npm run test:coverage` — Run tests once + generate HTML coverage report in `coverage/`
- `npm run lint` — Lint and fix with ESLint
- `npm run format` — Format with Prettier
- `npm run contract:gen` — Regenerate `src/types/generated/api.ts` from `../contract/api.schema.json`
- `npm run contract:check` — Fail if the generated API types are out of date (CI and the pre-push hook run it)

## Tech Stack

- Vue 3.5+ with TypeScript (script setup, Composition API)
- Vite (build tool) + `@tailwindcss/vite` plugin
- Tailwind CSS 4 — CSS-first config in `src/assets/main.css`, no `tailwind.config.*`
- `@tailwindcss/forms` — form element reset, registered via `@plugin` directive
- `@vueuse/core` — `useDark()` powers the ThemeToggle
- Shell derived from Cruip Mosaic Vue admin template (ported to TypeScript)
- Pinia — state management
- Vue Router — routing
- Vitest + Vue Test Utils + happy-dom — testing
- Chart.js 4 — charts via `src/utils/chartjs-config.ts` (direct, no wrapper). When adding a new chart, read [`docs/chart-style-guide.md`](docs/chart-style-guide.md) first — it documents the shared `buildLineChartOptions` helper and the bold-MA-over-faded-daily pattern.

## Git Hooks

The repo's tracked pre-push hook lives at the monorepo root (`../.githooks/pre-push`); `npm install` enables it via the `prepare` script. When a push touches `webapp/` or `contract/` code, it runs `contract:check` (generated API types up to date) + `format:check` (Prettier) + lint + `test:coverage` + build.

## Coverage Thresholds

The pre-push hook and CI enforce minimum test coverage (configured in `vitest.config.ts`). The push/build fails if any metric drops below:

- **Statements**: 85%
- **Branches**: 85%
- **Functions**: 85%
- **Lines**: 85%

When adding new components or store actions, add corresponding tests to stay above these thresholds.

## Commit, Push, and CI

This folder is part of the `johnmathews/journal` monorepo. Branching, PRs, CI
(`.github/workflows/webapp.yml`) and shipping are described in the root `CLAUDE.md`. When fixing
bugs, always write a failing test first that reproduces the issue, then fix the code to make it pass.

## Documentation lifecycle

- Prefer shorter docs over long ones, but no hard length cap — let scope and detail required dictate length.
- When a doc is **closed** (work units shipped) or **superseded** (replaced by a newer doc): add a status header
  (`**Status:** closed YYYY-MM-DD.` or `**Status:** superseded by [...](...) (YYYY-MM-DD).`) to the top of the old
  doc, then `git mv` it into `docs/archive/` in the same commit and update inbound links from active docs.
- The active `docs/` listing should only contain currently-load-bearing material. Closed and superseded plans live in
  `docs/archive/` so the rationale is preserved without cluttering the index.

## Shipping

See the root `CLAUDE.md` (§ Shipping): the webapp image is built by `.github/workflows/webapp.yml` on `main`, and
What's Up Docker on the `media` VM deploys it automatically about a minute later. A green merge is a prod deploy.

## Backend

The webapp connects to the server's REST API at /api/* (the backend lives in `../server`). During development, Vite proxies these requests to localhost:8400 where the server runs.

## Local Full-Stack Quickstart

The webapp can't be exercised meaningfully without a backend — protected routes 401, dashboards stay empty, etc. Use this runbook whenever you need to verify UI work in a real browser. Full details with SQL snippets and a fake-jobs seeder live in [`docs/development.md`](docs/development.md#local-full-stack-quickstart).

```bash
# All commands run from the repo root, each in its own terminal.
# 1. ChromaDB
(cd server && docker compose -f docker-compose.dev.yml up -d)

# 2. Backend (separate terminal) — needs a .env (see docs/development.md)
cd server && uv sync && uv run python -m journal.mcp_server

# 3. Webapp (another terminal)
cd webapp && npm install && npm run dev   # http://localhost:5173
```

To get past auth, register at `/register` then mark the user verified in SQLite (SMTP isn't wired up in dev):

```bash
sqlite3 server/journal.db \
  "UPDATE users SET email_verified = 1 WHERE email = 'dev@local.dev';"
```

Standard local creds used in our docs: `dev@local.dev` / `devpassword123`.
