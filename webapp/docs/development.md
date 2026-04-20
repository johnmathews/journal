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

## Commands

| Command             | Description                    |
|---------------------|--------------------------------|
| `npm run dev`       | Start dev server (port 5173)   |
| `npm run build`     | Type-check + production build  |
| `npm run preview`   | Preview production build       |
| `npm run test:unit` | Run tests once                 |
| `npm run test:watch`| Run tests in watch mode        |
| `npm run lint`      | Lint and auto-fix with ESLint  |
| `npm run format`    | Format with Prettier           |

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

A **pre-push** hook runs the linter and test suite before every `git push`. If either fails, the push is aborted. The hook lives at `.git/hooks/pre-push` and is not tracked by git — each developer must set it up locally:

```bash
cat > .git/hooks/pre-push << 'EOF'
#!/bin/sh
set -e
echo "Running linter..."
npm run lint --prefix "$(git rev-parse --show-toplevel)"
echo "Running tests..."
npm run test:unit --prefix "$(git rev-parse --show-toplevel)"
echo "All checks passed."
EOF
chmod +x .git/hooks/pre-push
```

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
| Statements | 90%     | 96.36%           |
| Branches   | 85%     | 91.48%           |
| Functions  | 90%     | 97.01%           |
| Lines      | 90%     | 98.06%           |

The thresholds are set a few points below the current baseline so small incidental changes (a refactor that adds a handful of uncovered lines) don't flicker CI red, but a real regression (dropping a whole test file, introducing a large untested feature) will fail the build and block the Docker image from being published.

The CI workflow also uploads the HTML coverage report as a GitHub Actions artifact named `coverage-report` (14-day retention). To inspect coverage for a past CI run, open the run in the Actions tab, scroll to Artifacts, download `coverage-report.zip`, and open `index.html` in a browser.

When adding new code, especially in `src/api`, `src/stores`, `src/composables`, and `src/utils`, aim to leave the coverage numbers flat or improving. If a legitimate refactor drops a metric close to its threshold, bump the threshold up or down deliberately rather than letting it erode silently.
