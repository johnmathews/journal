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

- **DashboardView** (home route `/`) — Overview of writing
  activity and mood against the corpus. Filters: date range
  (last month / 3 months / 6 months / 1 year / all, default 3
  months) and bin width (week / month / quarter / year, default
  week). Renders three Chart.js 4 line charts:
  1. **Writing frequency** (entries per bin, violet) — driven
     by `/api/dashboard/writing-stats`.
  2. **Word count trend** (total words per bin, sky) — same
     endpoint, second series.
  3. **Mood** (multi-line, 7 colours) — driven by
     `/api/dashboard/mood-dimensions` +
     `/api/dashboard/mood-trends`. One line per currently-
     configured facet, fixed y-axis `[-1, +1]` so bipolar and
     unipolar facets share the same visual space (unipolar
     lines never dip below 0, which is visually informative).
     Dimension toggles above the chart let the user hide
     individual lines; state is local to the session.
  The mood chart card is conditionally rendered — when the
  server returns an empty dimension set
  (`JOURNAL_ENABLE_MOOD_SCORING=false` or config file empty)
  the card does not appear at all. Shows an explicit
  empty-state message (with current entry count surfaced) when
  the active range has fewer than 5 entries, following the
  "explicit > implicit" rule. Chart instances are destroyed
  and recreated on bin/range changes so axis labels and tick
  formatting match the new granularity without stale state.
- **EntryListView** (now at `/entries`, was `/`) — Native HTML table with Tailwind styling, hand-rolled pagination controls (rows-per-page select, prev/next buttons), row click navigation. Demoted from the home route when `DashboardView` shipped (Option B routing).
- **EntryDetailView** — Static 50/50 flex layout for OCR correction. The left panel renders the original OCR text as a read-only `<div>` with diff highlights; the right panel uses a mirror-div overlay (transparent textarea over a styled backdrop `<div>`) so the user can edit the corrected text and see live highlights in the same spot. A "Show diff" toggle turns highlighting on/off. Includes an inline save error banner, dirty tracking, and re-processing on save. Also exposes a Delete button (with a `window.confirm` guard) that removes the entry from both SQLite and ChromaDB and navigates back to the list on success. A three-radio **Overlay** segmented control (off / chunks / tokens) toggles visualisations of the embedding-model boundaries on top of the corrected panel — when either mode is active the textarea is hidden and the panel becomes read-only, so chunk and token offsets cannot drift from the text they describe. Accepts a `?chunk=N` query param for deep-link entry from SearchView: on mount the overlay flips to `chunks` mode and the matching chunk badge is scrolled into view.
- **SearchView** — Full-text search across journal entries. Wraps the server's `GET /api/search` endpoint via `useSearchStore`. Supports two modes: **semantic** (vector similarity, returns per-chunk matches with char offsets) and **keyword** (SQLite FTS5, returns an FTS5 `snippet()` string with highlighted terms). Each result row renders the entry date, a relevance score badge, and a snippet — in keyword mode the snippet is passed through `renderSnippetHtml` from `src/utils/searchSnippet.ts` which converts the server's `\x02`/`\x03` marker characters into `<mark>` tags. Clicking a result navigates to `EntryDetailView` with `?chunk=N` set to the top matching chunk's index so the user lands on the matching passage. Form state (query, mode, dates) is kept in the Pinia store so back-navigation preserves the query.

### Composables (`src/composables/`)
Reusable Composition API functions encapsulating reactive logic.

- **useEntryEditor** — Manages editor state: text syncing, dirty tracking, modification detection, reset
- **useDiffHighlight** — Computes the diff between the original OCR text and the edited text via `diff-match-patch` (with `diff_cleanupSemantic`), then returns two reactive HTML strings — one for each panel — containing `<mark>` spans for removed (red) and inserted (green) segments. Every character is escaped before being wrapped in markup so it is safe to render with `v-html`. The span-list data model is designed to accept additional highlight sources in the future (e.g. low-confidence OCR regions) without reshaping the API.
- **useOverlayHighlight** — Builds chunk- and token-boundary overlays on top of the corrected text. Takes refs for the text, the current overlay mode, and the cached chunk/token data, and returns a computed HTML string ready for `v-html`. Chunks support overlap (the fixed chunker's `overlap_tokens` and the semantic chunker's weak-cut lead-ins) via a breakpoint-sweep algorithm that classifies each interval by the set of chunks covering it, rendering single coverage as alternating sky/green spans and multiple coverage as a distinct violet "overlap" span. Tokens alternate sky/green without overlap (tiktoken tokens partition the text). Hover titles carry chunk index + token count, or token id, for debugging the chunker and tokeniser from the browser.

### Stores (`src/stores/`)
Pinia stores for server state management.

- **entries** — Entry list, current entry, pagination, loading/error states, CRUD actions
- **entities** — Entity list, current entity, mentions and relationships (entity tracking)
- **search** — Full-text search state: query, mode, date range, result items, `hasRun` flag so the view can distinguish "no results" from "not yet searched". Exposes a `runSearch(partial)` action that accepts per-call overrides (useful for pagination) and surfaces server error messages from `ApiRequestError` directly.
- **dashboard** — Dashboard filter state (range + bin) and the most recently fetched writing-stats bins, plus a parallel mood surface: `moodDimensions` (fetched once from `/api/dashboard/mood-dimensions` on mount), `moodBins` (fetched from `/api/dashboard/mood-trends` on every range/bin change), and `hiddenMoodDimensions: Set<string>` for per-session facet toggles. `loadMoodDimensions()` swallows errors (dimension-load failure is interpreted as "mood scoring not configured" and hides the card; it's not a loud error). `loadMoodTrends()` surfaces `ApiRequestError.message` verbatim like `loadWritingStats`. `toggleMoodDimension(name)` flips visibility and creates a new Set instance so Vue reactivity fires on the change. Initial state is `last_3_months` + `week`. A pure `rangeToDates(range, now)` helper (also exported for tests) converts a `DashboardRange` option into a concrete ISO `{from, to}` pair against an injectable clock.

### API Layer (`src/api/`)
Typed fetch wrappers for the journal-server REST API.

- **client.ts** — Generic `apiFetch<T>` with error handling and `ApiRequestError` class (carries `errorCode` so callers can disambiguate e.g. `chunks_not_backfilled` from a generic 404)
- **entries.ts** — Endpoint functions: `fetchEntries`, `fetchEntry`, `updateEntryText`, `deleteEntry`, `fetchStats`, `fetchEntryChunks`, `fetchEntryTokens`

### Types (`src/types/`)
Shared TypeScript interfaces matching the REST API response schemas.

## Routing

The home route (`/`) is the **Dashboard**. Entries list is
reachable at `/entries`, entry detail at `/entries/:id`, search
at `/search`, and entity tracking at `/entities`. The 2026-04-11
"Option B" migration flipped `/` from the entries list to the
dashboard — see the matching journal entry for the audit of
every `RouterLink to="/"` and `router.push({ name: 'entries' })`
call site.

## Sidebar expanded-by-default

`AppSidebar` defaults its `sidebarExpanded` state based on a
`window.matchMedia('(min-width: 1024px)')` check when no explicit
preference is stored in localStorage. Wide displays (lg+) start
with the full nav labels visible; phones and small tablets start
collapsed. Toggling the expand button persists the explicit
preference to localStorage, which always wins over the viewport
default on subsequent visits. The mobile hamburger state
(`sidebarOpen` prop) is a separate concern and is unaffected.

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
