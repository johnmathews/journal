# Development Guide

## Prerequisites

- Node.js 22+
- npm 10+
- journal-server running on localhost:8400 (for API access)

## Setup

```bash
git clone https://github.com/johnmathews/journal-webapp.git
cd journal-webapp
npm install
```

## Development Server

```bash
npm run dev
```

Opens at http://localhost:5173. The Vite dev server proxies `/api/*` to `localhost:8400`.

To work without the backend, the app will show error states — this is expected. Use the test suite for development without a running backend.

## Local Full-Stack Quickstart

The webapp needs the backend (REST API on `:8400`) and ChromaDB (`:8401`) to run. Once the stack is up, register a user via the UI, mark them email-verified in SQLite, and log in. Total time on a fresh checkout: ~2 minutes.

```bash
# 1. ChromaDB (Docker)
cd ../journal-server
docker compose -f docker-compose.dev.yml up -d

# 2. Backend (separate terminal)
cd journal-server
cp .env.example .env  # first time only — see notes below
uv sync
uv run python -m journal.mcp_server   # listens on :8400

# 3. Webapp (another terminal)
cd journal-webapp
npm install                            # first time only
npm run dev                            # opens http://localhost:5173
```

### Required `.env` keys (for browsing the UI only)

The backend refuses to start without `JOURNAL_API_TOKEN` and `JOURNAL_SECRET_KEY`. For local dev these can be any random strings — placeholders are fine. To allow self-service registration set `REGISTRATION_ENABLED=true`. API keys (`ANTHROPIC_API_KEY`, `OPENAI_API_KEY`) are only needed for ingestion / semantic search; they can stay as `sk-...placeholder` values for everything else.

A complete minimal local `.env`:

```
JOURNAL_API_TOKEN=local-dev-token-placeholder-1234567890
JOURNAL_SECRET_KEY=local-dev-secret-key-placeholder-1234567890
ANTHROPIC_API_KEY=sk-ant-placeholder
OPENAI_API_KEY=sk-placeholder
CHROMADB_HOST=localhost
CHROMADB_PORT=8401
MCP_HOST=0.0.0.0
MCP_PORT=8400
MCP_ALLOWED_HOSTS=127.0.0.1,localhost
API_CORS_ORIGINS=http://localhost:5173
REGISTRATION_ENABLED=true
```

### Creating a local test user

The auth middleware blocks unverified users from every protected endpoint, so a self-registered user can't browse the app until their email is verified. SMTP isn't configured in dev, so flip the bit directly in SQLite.

**Option A — register via the UI then verify in SQL** (recommended):

1. Open http://localhost:5173/register and submit a form (e.g. `dev@local.dev` / `devpassword123` / `Dev User`). The backend creates the user and sets a session cookie immediately.
2. Mark the new user verified:

   ```bash
   sqlite3 journal-server/journal.db \
     "UPDATE users SET email_verified = 1 WHERE email = 'dev@local.dev';"
   ```

3. Reload the page — protected routes now load.

**Option B — register via curl, then verify in SQL** (no UI needed, useful for scripts):

```bash
curl -sS -X POST http://localhost:8400/api/auth/register \
  -H 'Content-Type: application/json' \
  -d '{"email":"dev@local.dev","password":"devpassword123","display_name":"Dev User"}'

sqlite3 journal-server/journal.db \
  "UPDATE users SET email_verified = 1 WHERE email = 'dev@local.dev';"
```

Then go to http://localhost:5173/login and sign in with the credentials.

### Verifying the stack is healthy

```bash
curl -sf http://localhost:8401/api/v2/heartbeat   # ChromaDB
curl -sf http://localhost:8400/health             # journal-server (returns "degraded" with placeholder API keys — expected)
curl -sf http://localhost:8400/api/auth/config    # should show {"registration_enabled":true}
```

### Populating job history for UI work

The Job History view is empty for fresh users. To populate it without running real jobs (which need real API keys), insert fake rows:

```bash
sqlite3 journal-server/journal.db <<'SQL'
-- Replace user_id=3 with the id from: SELECT id, email FROM users;
INSERT INTO jobs (id, type, status, params_json, progress_current, progress_total,
                  result_json, error_message, created_at, started_at, finished_at, user_id)
VALUES
 ('11111111-1111-1111-1111-111111111111', 'mood_backfill', 'succeeded',
  '{"start_date":"2026-01-01","end_date":"2026-05-02","stale_only":true}',
  31, 31, '{"scored":31,"skipped":0,"warnings":[]}', NULL,
  '2026-05-02T10:03:37Z','2026-05-02T10:03:37Z','2026-05-02T10:10:20Z', 3),
 ('44444444-4444-4444-4444-444444444444', 'save_entry_pipeline', 'succeeded',
  '{"entry_id":78,"notify_strategy":"compressed_all"}',
  3, 3,
  '{"entry_id":78,"notification_sent":1,"follow_up_jobs":{"entity_extraction":"a","mood_score_entry":"b","reprocess_embeddings":"c"}}',
  NULL, '2026-05-01T14:26:17Z','2026-05-01T14:26:17Z','2026-05-01T14:26:50Z', 3);
SQL
```

### Tearing down

```bash
# Stop ChromaDB
cd journal-server && docker compose -f docker-compose.dev.yml down
# Stop the foreground processes (Ctrl-C in their terminals)
```

The SQLite DB persists between runs at `journal-server/journal.db`. Delete it to start clean — it will be re-created on next backend start.

## Commands

| Command              | Description                                      |
|----------------------|--------------------------------------------------|
| `npm run dev`        | Start dev server (port 5173)                     |
| `npm run build`      | Type-check + production build                    |
| `npm run preview`    | Preview production build                         |
| `npm run test:unit`  | Run tests once                                   |
| `npm run test:watch` | Run tests in watch mode                          |
| `npm run test:coverage` | Run tests + enforce coverage thresholds       |
| `npm run lint`       | Lint and auto-fix with ESLint                    |
| `npm run format`     | Format with Prettier                             |

## Project Structure

```
src/
  api/           — REST API client (fetch wrappers, typed endpoints)
  assets/        — Static resources (images, fonts)
  components/    — Reusable components (shared across views)
  composables/   — Composition functions (useEntryEditor, etc.)
  layouts/       — Page layouts (DefaultLayout with sidebar nav)
  router/        — Vue Router config (entry list + detail routes)
  stores/        — Pinia stores (entries store)
  types/         — TypeScript interfaces (API response types)
  utils/         — Pure utility functions
  views/         — Page components (EntryListView, EntryDetailView)
```

## Adding a New View

1. Create `src/views/MyNewView.vue`
2. Add a route in `src/router/index.ts`
3. Add a nav link in `src/layouts/DefaultLayout.vue`
4. If it needs API data, add functions to `src/api/` and a Pinia store in `src/stores/`
5. Write tests in `src/views/__tests__/`

## Adding a New API Endpoint

1. Add the TypeScript response type to `src/types/`
2. Add the fetch function to the appropriate file in `src/api/`
3. If the endpoint serves a view, add a Pinia store action
4. Write tests for the API function and store action

## Environment Variables

| Variable       | Description                | Default |
|----------------|----------------------------|---------|
| `VITE_API_URL` | API base URL override      | `` (uses relative /api/) |

## Git Hooks

Git hooks are managed by [Husky](https://typicode.github.io/husky/) and tracked in the `.husky/` directory. They are installed automatically when you run `npm install` (via the `prepare` script).

A **pre-push** hook runs the linter and the full test suite with coverage thresholds before every `git push`. If linting fails, tests fail, or coverage drops below the minimums defined in `vitest.config.ts`, the push is aborted.

## Docker

```bash
# Build and run locally
docker compose up

# The webapp runs on port 8402
# journal-server on port 8400
# ChromaDB on port 8401
```

## Testing

Tests use Vitest with happy-dom. API calls are mocked — no backend needed.

```bash
npm run test:unit        # Run once
npm run test:watch       # Watch mode
npm run test:coverage    # Run once + generate HTML coverage report in coverage/
```

Component tests mount Vue components with Pinia and Router plugins. Composable tests run in isolation with reactive refs. View tests assert against `data-testid` attributes rather than CSS classes for stability across styling changes.

### Coverage

Coverage is collected by `@vitest/coverage-v8` using V8's native coverage instrumentation (configured in `vitest.config.ts`). After running `npm run test:coverage`:

- A text summary prints to the terminal
- An HTML report is written to `coverage/index.html` — open it in a browser for line-by-line drill-down
- A `coverage/coverage-summary.json` file is produced for machine consumption (e.g., future CI badges)

The coverage config excludes files that aren't meaningful to measure: test files themselves, `src/main.ts` (bootstrap), `src/router/**` (trivial wiring), `src/types/**` (interfaces have no runtime), and `src/assets/**` (CSS). The `coverage/` directory is gitignored.

CI runs `npm run test:coverage` on every push to `main` and every PR, and enforces minimum thresholds defined in `vitest.config.ts`:

| Metric     | Minimum | Current baseline |
| ---------- | ------- | ---------------- |
| Statements | 85%     | 91.29%           |
| Branches   | 85%     | 86.11%           |
| Functions  | 85%     | 87.21%           |
| Lines      | 85%     | 92.70%           |

The thresholds are set a few points below the current baseline so small incidental changes (a refactor that adds a handful of uncovered lines) don't flicker CI red, but a real regression (dropping a whole test file, introducing a large untested feature) will fail the build and block the Docker image from being published.

The CI workflow also uploads the HTML coverage report as a GitHub Actions artifact named `coverage-report` (14-day retention). To inspect coverage for a past CI run, open the run in the Actions tab, scroll to Artifacts, download `coverage-report.zip`, and open `index.html` in a browser.

When adding new code, especially in `src/api`, `src/stores`, `src/composables`, and `src/utils`, aim to leave the coverage numbers flat or improving. If a legitimate refactor drops a metric close to its threshold, bump the threshold up or down deliberately rather than letting it erode silently.
