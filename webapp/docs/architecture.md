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
     Click a data point to open an inline drill-down panel
     showing the individual entries that contributed to that
     period's average, with per-entry score and rationale.
     Clicking an entry row navigates to `EntryDetailView`.
  The mood chart card is conditionally rendered — when the
  server returns an empty dimension set
  (`JOURNAL_ENABLE_MOOD_SCORING=false` or config file empty)
  the card does not appear at all. Shows an explicit
  empty-state message (with current entry count surfaced) when
  the active range has fewer than 5 entries, following the
  "explicit > implicit" rule. Chart instances are destroyed
  and recreated on bin/range changes so axis labels and tick
  formatting match the new granularity without stale state.
- **`/insights` route** — Retired. The router redirects `/insights → /` and
  there is no `InsightsView.vue`. The mood-trends + drill-down behaviour
  originally drafted for this view was absorbed into `DashboardView` (mood
  chart card with click-through drill-down), and the "What I Write About"
  doughnut chart was not adopted. `src/stores/insights.ts` has already been
  removed. `src/api/insights.ts` is still in use — `useDashboardStore` calls
  `fetchEntityDistribution` and `fetchMoodDrilldown` from it.
- **EntryListView** (now at `/entries`, was `/`) — Native HTML table with Tailwind styling, hand-rolled pagination controls (rows-per-page select, prev/next buttons), row click navigation. Demoted from the home route when `DashboardView` shipped (Option B routing). Columns are rendered via a dynamic `v-for` over an ordered `ColumnDef` array (not hardcoded per-column blocks), enabling user-configurable column visibility and drag-and-drop reordering. The **Columns** dropdown menu shows checkboxes for toggling visibility and grip-dot drag handles for reordering — both always available, no separate edit mode needed. Ten columns are defined: Date, Source, Ingested, Doubts, Words, Pages (visible by default), plus Chunks, Language, Modified, and Entities (hidden by default). Column preferences (visibility and order) are persisted to the server via `PATCH /api/users/me/preferences` with a 500ms debounce (same pattern as the dashboard layout), so settings follow the user across clients. On mount, preferences are loaded from the server; if the fetch fails, defaults are used silently.
- **EntryDetailView** — Two view modes controlled by a **Read / Edit** segmented toggle. **Reading mode** renders the corrected text in a single centered pane (`max-w-prose`) with comfortable serif typography — the default when the entry has been edited before (`raw_text !== final_text`). **Edit mode** is a responsive flex layout for OCR correction: the left panel renders the original OCR text as a read-only `<div>` with diff highlights; the right panel uses a CSS Grid overlay pattern (invisible sizer div + styled backdrop + transparent textarea sharing a single grid cell via `[grid-area:1/1]`) so the user can edit the corrected text and see live highlights in the same spot — this is the default for unedited entries. Both panels auto-size to their content (no internal scrolling) which is especially important on mobile where scrolling inside fixed-height text areas is awkward. On desktop (`lg+`) the panels sit side-by-side with equal width (`flex-1`); on mobile they stack vertically. Save feedback is a non-blocking toast: "Text saved. Entity extraction running in background." (or just "Text saved." when no extraction job was triggered). Entity chips appear above the text in both modes. Clicking a chip highlights all occurrences of the entity in the text using the verbatim `quotes` from the extraction (not just the canonical name), with auto-scroll to the first match. The highlighting builds a single alternation regex from the entity's canonical name, aliases, and quotes, sorted longest-first so longer spans match before substrings. A "Show diff" toggle turns diff highlighting on/off; a separate "Review" toggle overlays OCR uncertainty highlights (yellow, dotted underline) on the Original OCR panel only — it's disabled with a tooltip for entries whose `uncertain_spans` array is empty (old entries and entries where the model was fully confident). Includes an inline save error banner, dirty tracking, and re-processing on save. Also exposes a Delete button (with a `window.confirm` guard) that removes the entry from both SQLite and ChromaDB and navigates back to the list on success. A three-radio **Overlay** segmented control (off / chunks / tokens) toggles visualisations of the embedding-model boundaries on top of the corrected panel — when either mode is active the textarea is hidden and the panel becomes read-only, so chunk and token offsets cannot drift from the text they describe. Accepts a `?chunk=N` query param for deep-link entry from SearchView: on mount the overlay flips to `chunks` mode and the matching chunk badge is scrolled into view. The template is **render-safe by contract**: it carries an unconditional `v-else` "Loading entry…" branch so the initial tick before `onMounted` never leaves `<main>` empty, all direct property accesses (`word_count.toLocaleString()`, `source_type.toUpperCase()`, `page_count`) use `??` fallbacks so a missing field cannot bail out of the rendered subtree, the `useDiffHighlight` / `useEntryEditor` composables coerce `null` text to `''` before calling `diff-match-patch`, and the entity chip strip reads `resp.items` (the server's real `{entry_id, items, total}` shape) with a `?? []` fallback and a `v-if="entryEntities?.length"` so any off-contract payload fails hidden instead of blanking the view. Each of those was a blank-page failure mode — see `journal/260411-blank-page-regression.md` and `journal/260411-entry-entities-contract.md`.
- **JobHistoryView** (`/jobs`) — Paginated table of background jobs (entity extraction, mood scoring, ingestion, embeddings reprocessing). Fetches from `GET /api/jobs` via `listJobs()` with optional status/type filters. Each job type has a color-coded badge (blue/amber/teal/cyan/purple). Entry IDs are extracted from params or result and rendered as clickable `RouterLink`s to `/entries/:id`. The Created column shows both absolute timestamps and relative time ("2h ago"). The Details column is expandable — clicking a succeeded job's summary toggles a `<dl>` showing all result fields except internal keys (`entry_id`, `follow_up_jobs`, `entry_date`, `source_type`). For ingestion jobs, the collapsed summary shows word count, chunk count, and page/recording count. On first expand, follow-up job statuses (mood scoring, entity extraction) are lazily fetched via `getJob()` and shown as inline status badges. Pagination is hand-rolled with 25-item pages.
- **SettingsView** (`/settings`) — Per-user settings page reachable by every authenticated user (no admin guard). Three sections: **Profile** (display name, also used as the journal author name during entity extraction; saving a new name surfaces a one-click prompt to re-run entity extraction so first-person pronouns resolve to the new name), **Maintenance** (per-user batch jobs — Mood Backfill and Entity Extraction trigger buttons, both scoped server-side to the calling user's entries; Mood Backfill is disabled when the `mood_scoring` feature flag is off), and **Notifications** (the existing `NotificationsSettings` component). System-wide configuration (runtime toggles, processing-pipeline config, API pricing, Health) lives under `/admin/*` instead.
- **AdminLayout** (`/admin/*`) — Admin-only area gated by the router's `requiresAdmin` meta + `useAuthStore.isAdmin`. Renders the page header and a five-tab bar (Overview / Users / Runtime / Pricing / Server) with an embedded `<RouterView/>` so each child route renders inside the layout. The active tab is highlighted by matching `route.name` against each tab's `routeName`.
- **AdminOverview** (`/admin`, default tab) — Operator landing page. Shows the Health card (overall status, uptime, ingestion totals, per-component check status, ingestion stats over 7d/30d), an Estimated-Cost-per-1,000-Words card that breaks ingestion + first-edit costs down by stage and renders grand totals for image and audio paths, and a quick-link grid to the other admin tabs. All cost figures recompute from `useSettingsStore.pricingConfig` so editing pricing on the Pricing tab reflects here.
- **AdminDashboard** (Users tab, `/admin/users`) — Lists all users with stats and toggles `is_active`. (Renamed from the old `/admin` default; the route name moved from `admin-dashboard` to `admin-users`.)
- **AdminRuntimeView** (`/admin/runtime`) — Houses every Runtime Settings toggle/select that hits `PATCH /api/settings/runtime` (filtered to hide `transcript_formatting`, which is surfaced inside the Audio Ingestion sub-card instead so the model selection stays adjacent to the toggle that gates it), plus the read-only Processing Pipeline sub-cards (1a OCR, 1b Audio Ingestion, 2 Chunking & Embedding, 3 Mood Scoring, 4 Entity Extraction). Each sub-card carries its own per-1k-words cost badge.
- **AdminPricingView** (`/admin/pricing`) — Editor for the per-model pricing rows (LLM, embedding, transcription) that drive the cost estimates. Click-to-edit inline rows post via `PATCH /api/settings/pricing`; the API response replaces `store.settings.pricing` so cards on Overview and Runtime recalculate immediately.
- **AdminServerView** (`/admin/server`) — Three buttons that hit `POST /api/admin/reload/{ocr-context,transcription-context,mood-dimensions}` to make the server re-read its file-backed config without a restart; each section shows the server's summary response (provider, stack, dimension list, timestamp) and surfaces `ApiRequestError.message` on failure. Backed by `src/api/admin.ts` (typed reload functions); no Pinia store — local component state is enough for one-off operator actions.
- **AdminMoodsView** (`/admin/moods`) — Read-only inspector for the active mood-dimension configuration loaded by the server.
- **CreateEntryView** (`/entries/new`) — Multi-modal entry creation page that hosts the file-import, file-upload, image-upload, voice-record, and text-entry panel components.
- **EntityListView** (`/entities`) and **EntityDetailView** (`/entities/:id`) — Browse and edit tracked entities (people, places, tags). Detail view exposes alias and merge management.
- **SearchView** — Full-text search across journal entries. Wraps the server's `GET /api/search` endpoint via `useSearchStore`. Supports two modes: **keyword** (SQLite FTS5, default) and **semantic** (vector similarity, returns per-chunk matches with char offsets). Keyword is the default because exact-term lookup is the more common use case; semantic search is one click away. Clicking either mode button immediately triggers a new search (if a query is present) so the user can compare modes without re-submitting. Each result row renders the entry date, a relevance score badge, and a snippet — in keyword mode the snippet is passed through `renderSnippetHtml` from `src/utils/searchSnippet.ts` which converts the server's `\x02`/`\x03` marker characters into `<mark>` tags. In semantic mode, each result includes a "Matched by meaning" explanation showing why the result is relevant (similarity percentage of the top matching chunk, plus up to 2 additional matching chunks with their scores and text previews). Clicking a result navigates to `EntryDetailView` with `?chunk=N` set to the top matching chunk's index so the user lands on the matching passage. Form state (query, mode, dates) is kept in the Pinia store so back-navigation preserves the query.

### Composables (`src/composables/`)
Reusable Composition API functions encapsulating reactive logic.

- **useToast** — Global toast notification system with module-level reactive state. Provides `show()`, `success()`, `error()`, and `dismiss()` methods. Toasts auto-dismiss after a configurable duration (default 5s). Used by `AppNotifications` to surface job completion results and by `EntryDetailView` for save feedback.
- **useEntryEditor** — Manages editor state: text syncing, dirty tracking, modification detection, reset
- **useDiffHighlight** — Computes the diff between the original OCR text and the edited text via `diff-match-patch` (with `diff_cleanupSemantic`), then returns two reactive HTML strings — one for each panel — containing `<mark>` spans for removed (red) and inserted (green) segments. Every character is escaped before being wrapped in markup so it is safe to render with `v-html`. Accepts an optional `{ uncertainSpans, showReview }` options bag on the Original OCR side: when the Review toggle is on, uncertain character ranges are re-segmented and rendered with a yellow `uncertain` (or composite `diff-delete-uncertain`) class so the overlap-with-a-delete case keeps both signals visible. The re-segmentation preserves `join(segments.text) === original`, so any offset-sensitive consumer downstream stays aligned.
- **useOverlayHighlight** — Builds chunk- and token-boundary overlays on top of the corrected text. Takes refs for the text, the current overlay mode, and the cached chunk/token data, and returns a computed HTML string ready for `v-html`. Chunks support overlap (the fixed chunker's `overlap_tokens` and the semantic chunker's weak-cut lead-ins) via a breakpoint-sweep algorithm that classifies each interval by the set of chunks covering it, rendering single coverage as alternating sky/green spans and multiple coverage as a distinct violet "overlap" span. Tokens alternate sky/green without overlap (tiktoken tokens partition the text). Hover titles carry chunk index + token count, or token id, for debugging the chunker and tokeniser from the browser.
- **useWakeLock** — Wraps the Screen Wake Lock API to keep the screen awake during active voice recording.

### Stores (`src/stores/`)
Pinia stores for server state management.

- **jobs** — Background job polling and notification grouping. Tracks jobs via a reactive `jobs` record keyed by job ID. `trackJob(id, type, params, groupId?)` creates a placeholder and starts a 1-second poll loop. `createGroup(id, label)` registers a named group; grouped jobs dismiss together from the notification dropdown when the whole pipeline finishes. Each job fires its own individual success or error toast via `AppNotifications` — toasts are not compressed because they are transient and non-blocking (Pushover notifications are compressed server-side instead). When a parent ingestion job completes with `result.follow_up_jobs`, follow-up jobs are automatically tracked in the parent's group. Also exposes `startEntityExtraction`, `startMoodBackfill` (for batch modals), and `hydrateActiveJobs` (discovers server-side jobs on app startup).
- **entries** — Entry list, current entry, pagination, loading/error states, CRUD actions
- **entities** — Entity list, current entity, mentions and relationships (entity tracking). Includes alias-management actions (`addAlias`, `removeAlias`) used by the chip-based aliases section on `EntityDetailView`. `updateCurrentEntity` watches for `reembed_job_id` on the PATCH response (server-side WU2: an async `entity_reembed` job fires whenever description changes, so future entity recognition reflects the edit) and forwards it to `useJobsStore.trackJob` for the toast pipeline. The transport-only `reembed_job_id` field is stripped before storing in `currentEntity`.
- **search** — Full-text search state: query, mode, date range, result items, `hasRun` flag so the view can distinguish "no results" from "not yet searched". Exposes a `runSearch(partial)` action that accepts per-call overrides (useful for pagination) and surfaces server error messages from `ApiRequestError` directly.
- **notifications** — Per-user notification preferences (Pushover etc.) backed by `/api/notifications/preferences`.
- **settings** — Runtime settings + pricing config consumed by the admin pages.
- **auth** — Cookie-session authentication state. See `docs/auth.md`.
- **dashboard** — Dashboard filter state (range + bin) and the most recently fetched writing-stats bins, plus a parallel mood surface: `moodDimensions` (fetched once from `/api/dashboard/mood-dimensions` on mount), `moodBins` (fetched from `/api/dashboard/mood-trends` on every range/bin change), and `selectedMoodDimensions: Set<string>` for per-session facet toggles. Empty selection means "show every dimension" (the user-visible "no selection = show all" mental model); non-empty selects a subset. Default on first load is `Set(['agency'])` so the chart lands on a single line. Group-level bulk actions are powered by `moodGroupSelectionState(memberNames)` (returns `'all' | 'some' | 'none'`) and `toggleMoodGroup(memberNames)` — clicking a group chip adds every member when none are selected, otherwise removes every member. Group definitions live in `src/utils/mood-groups.ts` (mirrors the comment in `mood-dimensions.toml`). Includes drill-down state (`drillPeriod`, `drillDimension`, `drillEntries`) and actions (`loadDrillDown`, `clearDrillDown`, `periodEndDate`) so clicking a mood chart data point on the dashboard shows the same entry-level detail as the Insights page. `loadMoodDimensions()` swallows errors (dimension-load failure is interpreted as "mood scoring not configured" and hides the card; it's not a loud error). `loadMoodTrends()` surfaces `ApiRequestError.message` verbatim like `loadWritingStats`. `toggleMoodDimension(name)` flips a single dimension's selection state and creates a new Set instance so Vue reactivity fires on the change. Initial state is `last_3_months` + `week`. A pure `rangeToDates(range, now)` helper (also exported for tests) converts a `DashboardRange` option into a concrete ISO `{from, to}` pair against an injectable clock.

### API Layer (`src/api/`)
Typed fetch wrappers for the journal-server REST API.

- **client.ts** — Generic `apiFetch<T>` with error handling and `ApiRequestError` class. Carries `errorCode` (so callers can disambiguate e.g. `chunks_not_backfilled` from a generic 404) and `body: Record<string, unknown> | null` — the parsed JSON response body, useful when the server's error response carries structured data the caller needs to act on. The 409 from `POST /api/entities/{id}/aliases` uses this to surface `existing_entity_id`, `existing_canonical_name`, and `existing_entity_type` to the alias-collision merge dialog.
- **entries.ts** — Endpoint functions: `fetchEntries`, `fetchEntry`, `updateEntryText`, `deleteEntry`, `fetchStats`, `fetchEntryChunks`, `fetchEntryTokens`
- **entities.ts** — Endpoint functions for entity tracking, including alias CRUD (`addEntityAlias`, `removeEntityAlias`, `lookupAliasOwner`) and `updateEntity` whose response is typed `Entity & { reembed_job_id?: string }` to surface the server-side async re-embed job id when a description change triggered one.
- Other modules: `admin.ts`, `dashboard.ts`, `insights.ts`, `jobs.ts`, `notifications.ts`, `preferences.ts`, `search.ts`, `settings.ts` — each is a typed wrapper over the matching `/api/*` namespace.

### Utilities (`src/utils/`)
Pure helper functions with no Vue or store dependencies.

- **chartjs-config.ts** — Chart.js global defaults and helper functions for dashboard charts
- **mosaic.ts** — CSS/colour helpers ported from the Mosaic admin template
- **searchSnippet.ts** — Converts FTS5 snippet marker characters (`\x02`/`\x03`) into `<mark>` HTML tags for rendering search result highlights
- **cost-estimates.ts** — Computes per-1k-words ingestion + first-edit costs for the Admin Overview / Runtime cost cards using the live pricing rows.
- **dateRange.ts** — Pure ISO-date helpers shared by the dashboard and search range pickers.
- **mood-display.ts**, **mood-groups.ts** — Display labels and group definitions for mood dimensions (mirrors the server's `mood-dimensions.toml`).

### Types (`src/types/`)
Shared TypeScript interfaces matching the REST API response schemas.

## Routing

The home route (`/`) is the **Dashboard**. Entries list is
reachable at `/entries`, entry detail at `/entries/:id`, search
at `/search`, entity tracking at `/entities`, and jobs at
`/jobs`. The legacy `/insights` path now redirects to `/`. The
2026-04-11 "Option B" migration flipped `/` from the entries list
to the dashboard — see the matching journal entry for the audit of
every `RouterLink to="/"` and `router.push({ name: 'entries' })`
call site.

## Typography & Contrast

Text contrast follows a two-tier system targeting WCAG AAA (7:1) for all secondary
text. Visual hierarchy comes from font size and weight, not barely-distinguishable
shades of gray.

| Level       | Light mode   | Dark mode    | Contrast | Use                                    |
|-------------|-------------|--------------|----------|----------------------------------------|
| **Primary** | gray-800/900 | gray-100/200 | ~13:1+   | Headings, values, data, model names    |
| **Secondary** | gray-600   | gray-300     | ~7:1     | Labels, descriptions, metadata, dates  |

### Rules

- Never use `text-gray-400` or lighter for readable text in light mode.
- Never use `dark:text-gray-500` or darker for readable text in dark mode.
- The minimum text color in light mode is `text-gray-600` (`#4b5563`, ~7:1 on white).
- The minimum text color in dark mode is `dark:text-gray-300` (`#bfc4cd`, ~6.7:1 on gray-800).
- Heading hierarchy uses font size (`text-2xl` → `text-lg` → `text-sm` → `text-xs`)
  and weight (`font-bold` → `font-semibold` → `font-medium`), not color variation.

### Custom gray scale

The project uses a custom gray palette defined in `src/assets/main.css` `@theme` block
(not Tailwind defaults). Key values: gray-300 `#bfc4cd`, gray-500 `#6b7280`,
gray-600 `#4b5563`, gray-800 `#1f2937`, gray-900 `#111827`.

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

### Display contract: the DB is the single source of truth

Entity `canonical_name` and aliases are normalised on the **server** at write time
(see journal-server's `services/entity_naming.py` and `config/entity-casing-exceptions.toml`).
The webapp renders these strings **verbatim** — there is intentionally no client-side
title-caser. If two views ever disagree about how an entity is displayed, that is a bug:
both views read the same column from the same row, so the rendered string must match.

To change how an entity is displayed (e.g. `iOS` instead of `IOS`), edit the server's
`config/entity-casing-exceptions.toml` and re-run `journal renormalise-entity-casing
--apply`. Do not add per-name formatting in the webapp.
