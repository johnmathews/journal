# Architecture

## Overview

The journal-webapp is a Vue 3 single-page application that provides a web interface for the Journal Analysis Tool. It connects to the journal-server REST API to display, browse, and correct journal entries.

## Tech Stack

| Technology       | Purpose                                   |
|------------------|-------------------------------------------|
| Vue 3.5+         | UI framework (Composition API)            |
| TypeScript       | Type safety                               |
| Vite             | Build tool and dev server                 |
| Tailwind CSS 4   | Utility-first styling, CSS-first config   |
| @tailwindcss/vite| Tailwind integration for Vite             |
| @tailwindcss/forms| Form element reset and utility classes   |
| @vueuse/core     | Composition utilities (useDark for theme) |
| Pinia            | State management                          |
| Vue Router       | Client-side routing                       |
| Chart.js 4       | Charts (via src/utils/chartjs-config.ts)  |
| diff-match-patch | Live diff highlighting in the OCR editor  |
| Vitest           | Unit and component testing                |

Shell components (Sidebar, Header, ThemeToggle, DefaultLayout) are derived from the
[Cruip Mosaic](https://cruip.com/mosaic/) admin template, ported to TypeScript.

## Layers

### Views (`src/views/`)
Page-level components, one per route. Each view composes layout, components, and store interactions.

- **EntryListView** — Native HTML table with Tailwind styling, hand-rolled pagination controls (rows-per-page select, prev/next buttons), row click navigation
- **EntryDetailView** — Static 50/50 flex layout for OCR correction. The left panel renders the original OCR text as a read-only `<div>` with diff highlights; the right panel uses a mirror-div overlay (transparent textarea over a styled backdrop `<div>`) so the user can edit the corrected text and see live highlights in the same spot. A "Show diff" toggle turns highlighting on/off. Includes an inline save error banner, dirty tracking, and re-processing on save. Also exposes a Delete button (with a `window.confirm` guard) that removes the entry from both SQLite and ChromaDB and navigates back to the list on success. A three-radio **Overlay** segmented control (off / chunks / tokens) toggles visualisations of the embedding-model boundaries on top of the corrected panel — when either mode is active the textarea is hidden and the panel becomes read-only, so chunk and token offsets cannot drift from the text they describe.

### Composables (`src/composables/`)
Reusable Composition API functions encapsulating reactive logic.

- **useEntryEditor** — Manages editor state: text syncing, dirty tracking, modification detection, reset
- **useDiffHighlight** — Computes the diff between the original OCR text and the edited text via `diff-match-patch` (with `diff_cleanupSemantic`), then returns two reactive HTML strings — one for each panel — containing `<mark>` spans for removed (red) and inserted (green) segments. Every character is escaped before being wrapped in markup so it is safe to render with `v-html`. The span-list data model is designed to accept additional highlight sources in the future (e.g. low-confidence OCR regions) without reshaping the API.
- **useOverlayHighlight** — Builds chunk- and token-boundary overlays on top of the corrected text. Takes refs for the text, the current overlay mode, and the cached chunk/token data, and returns a computed HTML string ready for `v-html`. Chunks support overlap (the fixed chunker's `overlap_tokens` and the semantic chunker's weak-cut lead-ins) via a breakpoint-sweep algorithm that classifies each interval by the set of chunks covering it, rendering single coverage as alternating sky/green spans and multiple coverage as a distinct violet "overlap" span. Tokens alternate sky/green without overlap (tiktoken tokens partition the text). Hover titles carry chunk index + token count, or token id, for debugging the chunker and tokeniser from the browser.

### Stores (`src/stores/`)
Pinia stores for server state management.

- **entries** — Entry list, current entry, pagination, loading/error states, CRUD actions

### API Layer (`src/api/`)
Typed fetch wrappers for the journal-server REST API.

- **client.ts** — Generic `apiFetch<T>` with error handling and `ApiRequestError` class (carries `errorCode` so callers can disambiguate e.g. `chunks_not_backfilled` from a generic 404)
- **entries.ts** — Endpoint functions: `fetchEntries`, `fetchEntry`, `updateEntryText`, `deleteEntry`, `fetchStats`, `fetchEntryChunks`, `fetchEntryTokens`

### Types (`src/types/`)
Shared TypeScript interfaces matching the REST API response schemas.

## Data Flow

```
User Action → View Component → Pinia Store Action → API Function → REST API
                                                                      ↓
                              View re-renders ← Store state updates ← Response
```

## Backend Integration

The webapp connects to journal-server's REST API:
- **Development:** Vite proxies `/api/*` requests to `localhost:8400`
- **Production:** nginx proxies `/api/*` to the journal-server container

The webapp never connects to the MCP protocol. MCP is for LLM clients (Claude, Nanoclaw); the webapp uses the REST API.
