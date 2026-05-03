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
  types/                — TypeScript type definitions
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
- Chart.js 4 — charts via `src/utils/chartjs-config.ts` (direct, no wrapper)

## Git Hooks

Git hooks are managed by [Husky](https://typicode.github.io/husky/) (`.husky/` directory, installed automatically via `npm install`). A **pre-push** hook runs lint + `test:coverage`, enforcing minimum coverage thresholds before every push.

## Coverage Thresholds

The pre-push hook and CI enforce minimum test coverage (configured in `vitest.config.ts`). The push/build fails if any metric drops below:

- **Statements**: 85%
- **Branches**: 85%
- **Functions**: 85%
- **Lines**: 85%

When adding new components or store actions, add corresponding tests to stay above these thresholds.

## Commit, Push, and CI

After committing, always push and watch GitHub Actions CI (`gh run watch`). If CI fails, read the
logs, fix the issue, run the full test suite locally, commit, push, and watch again. Do not
consider work done until CI is green. When fixing bugs, always write a failing test first that
reproduces the issue, then fix the code to make it pass.

## Backend

The webapp connects to journal-server's REST API at /api/*. During development, Vite proxies these requests to localhost:8400 where the journal-server runs.

## Local Full-Stack Quickstart

The webapp can't be exercised meaningfully without a backend — protected routes 401, dashboards stay empty, etc. Use this runbook whenever you need to verify UI work in a real browser. Full details with SQL snippets and a fake-jobs seeder live in [`docs/development.md`](docs/development.md#local-full-stack-quickstart).

```bash
# 1. ChromaDB
cd ../journal-server && docker compose -f docker-compose.dev.yml up -d

# 2. Backend (separate terminal) — needs a .env (see docs/development.md)
cd ../journal-server && uv sync && uv run python -m journal.mcp_server

# 3. Webapp (another terminal)
cd journal-webapp && npm install && npm run dev   # http://localhost:5173
```

To get past auth, register at `/register` then mark the user verified in SQLite (SMTP isn't wired up in dev):

```bash
sqlite3 ../journal-server/journal.db \
  "UPDATE users SET email_verified = 1 WHERE email = 'dev@local.dev';"
```

Standard local creds used in our docs: `dev@local.dev` / `devpassword123`.
