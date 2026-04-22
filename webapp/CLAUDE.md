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

## Backend

The webapp connects to journal-server's REST API at /api/*. During development, Vite proxies these requests to localhost:8400 where the journal-server runs.
