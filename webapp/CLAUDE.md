# Journal Webapp

Vue 3 frontend for the Journal Analysis Tool. Displays journal entries, enables OCR correction, and will include dashboards.

## Project Structure

```
src/
  api/           — API client layer (fetch wrappers, typed endpoints)
  assets/        — Static resources
  components/    — Global reusable components
  composables/   — Composition functions (useEntryEditor, etc.)
  layouts/       — Page layout components (DefaultLayout)
  router/        — Vue Router configuration
  stores/        — Pinia stores (entries, etc.)
  types/         — TypeScript type definitions
  utils/         — Pure utility functions
  views/         — Page components (EntryListView, EntryDetailView)
```

## Commands

- `npm run dev` — Start dev server (port 5173, proxies /api to localhost:8400)
- `npm run build` — Type-check and build for production
- `npm run test:unit` — Run unit tests with Vitest
- `npm run test:watch` — Run tests in watch mode
- `npm run lint` — Lint and fix with ESLint
- `npm run format` — Format with Prettier

## Tech Stack

- Vue 3.5+ with TypeScript (script setup, Composition API)
- Vite (build tool)
- PrimeVue 4.5 (Aura theme) — UI components
- Pinia — State management
- Vue Router 4 — Routing
- Vitest + Vue Test Utils + happy-dom — Testing
- Chart.js via PrimeVue Chart — Charts (future dashboards)

## Backend

The webapp connects to journal-server's REST API at /api/*. During development, Vite proxies these requests to localhost:8400 where the journal-server runs.
