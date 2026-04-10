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
```

Component tests mount Vue components with Pinia and Router plugins. Composable tests run in isolation with reactive refs. View tests assert against `data-testid` attributes rather than CSS classes for stability across styling changes.
