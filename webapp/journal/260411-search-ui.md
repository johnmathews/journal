# 2026-04-11 — Search UI (Tier 1 item 4, webapp half)

Session 2 of the Tier 1 plan — the webapp `/search` view that
consumes the `GET /api/search` endpoint shipped earlier today in
`journal-server` (see sibling journal entry
`journal-server/journal/260411-search-backend.md`).

Closes work units **T1.4.d** (SearchView shell + Pinia store) and
**T1.4.e** (results list with highlights + click-through) from
`journal-server/docs/tier-1-plan.md`. **T1.4.f** (tests) is woven
through each step rather than treated as a separate unit.

## What shipped

### 1. Types and API client

- **`src/types/search.ts`** — mirrors the server contract:
  `SearchMode`, `SearchChunkMatch`, `SearchResultItem`,
  `SearchRequestParams`, `SearchResponse`. `chunk_index`,
  `char_start`, `char_end` on `SearchChunkMatch` are nullable
  because entries ingested before chunk persistence return `null`
  offsets from the server.
- **`src/api/search.ts`** — `searchEntries(params)` thin wrapper on
  `apiFetch`. Has its own `buildQuery` helper (the third copy
  in the `api/` folder — not worth extracting until it's doing
  more than three-call duty).

### 2. Snippet highlight renderer

- **`src/utils/searchSnippet.ts`** — `renderSnippetHtml(snippet)`:
  pure function that converts the server's FTS5 `snippet()` output
  (with ASCII `\x02` / `\x03` marker characters wrapping matched
  terms) into safe HTML with `<mark class="…">…</mark>` tags. All
  text is HTML-escaped before insertion; the only non-escaped
  markup in the output is the fixed `<mark>` element. Handles:
  1. Plain input with no markers (escaped, returned as-is).
  2. One or more marked spans (escaped, each wrapped).
  3. Unbalanced open marker (treats everything after the STX to
     end-of-string as highlighted — defensive against FTS5
     truncating a snippet mid-highlight at the window boundary).
  4. Zero-width highlight spans (skipped).
  5. HTML inside marked terms (escaped — this is the XSS guard).

  9 unit tests in `src/utils/__tests__/searchSnippet.test.ts`.

### 3. Pinia store

- **`src/stores/search.ts`** — `useSearchStore`. State: `query`,
  `mode`, `startDate`, `endDate`, `limit`, `offset`, `items`,
  `lastRunQuery`, `lastRunMode`, `loading`, `error`, `hasRun`.
  Action `runSearch(partial)` accepts per-call overrides so the
  view can paginate ("just bump `offset`") or run a search straight
  from a URL param without two writes. Surfaces
  `ApiRequestError.message` directly so the server's
  `invalid_query` / `missing_query` messages show up verbatim in
  the UI. An empty trimmed query clears results instead of firing
  a doomed request.

  9 unit tests in `src/stores/__tests__/search.test.ts`.

### 4. SearchView

- **`src/views/SearchView.vue`** — form with query input, mode
  toggle (radio buttons, semantic default), date range inputs,
  submit button. Form state is local refs bound to inputs; submit
  pushes into the store. States: initial / loading / error /
  empty / results list. Each result row renders the entry date
  (as a `RouterLink` back to `/entries/:id?chunk=N` for semantic
  hits, no `chunk` param for keyword hits since FTS5 doesn't
  produce per-chunk matches), a relevance-score percentage, and
  the snippet. The snippet comes from either `item.snippet`
  (keyword) or `item.matching_chunks[0].text` (semantic); both
  paths are rendered through `renderSnippetHtml` so keyword output
  gets `<mark>` tags and semantic output is still properly
  HTML-escaped. Pagination buttons at the bottom — since neither
  mode returns a total count, "more available" is inferred from
  `items.length === limit`.

  Uses the same Mosaic palette and component classes as
  `EntryListView` / `EntityListView`. No new components; the view
  is self-contained.

  10 unit tests in `src/views/__tests__/SearchView.test.ts`
  cover: initial state, empty-query no-op, semantic submit,
  keyword submit (with snippet marker → `<mark>` conversion),
  empty results, error banner (ApiRequestError path), date range
  filter, `?chunk=N` click-through for semantic, no `chunk` param
  for keyword, Next button pagination.

### 5. Deep-link chunk scroll in EntryDetailView

- **`src/views/EntryDetailView.vue`** — now reads `?chunk=N` from
  the route. When present, on mount the overlay mode flips to
  `chunks`, the chunks are fetched (via the existing lazy fetch
  watcher), and once they land the matching chunk badge
  (`[aria-label="chunk N start"]`, produced by
  `useOverlayHighlight`) is scrolled into view via
  `scrollIntoView({ behavior: 'smooth', block: 'center' })`.

  Implementation detail: the existing reset watcher on
  `currentEntry.id` already clears `overlayMode` on navigation, so
  the new scroll-setup watcher is defined **after** it in the
  file. Vue fires watchers in definition order, so on entry load
  the sequence is: reset watcher → `overlayMode = 'off'`,
  `chunks = null`; then scroll-setup watcher → `overlayMode =
  'chunks'`, `pendingScrollChunk = N`. A third `watch(chunks, …)`
  fires once chunks load non-null and `pendingScrollChunk` is set,
  waits two `nextTick`s for `v-html` to land in the DOM, then
  finds and scrolls the badge.

  The scroll-setup watcher is deliberately **not** declared with
  `{ immediate: true }`. An earlier iteration used immediate to
  catch the route query param on fresh mount, but in code review
  I realised a fresh mount where `store.currentEntry` still held
  a stale entry from a previous view would fire synchronously
  against the wrong id and start fetching chunks for the stale
  entry before `store.loadEntry` resolved for the new one.
  Waiting for `currentEntry.id` to actually change hands gives
  the reset watcher a clean, race-free handoff. All tests still
  pass without `immediate: true` because the `currentEntry.id`
  transition during the `store.loadEntry` promise is still a
  reactive change.

  3 unit tests in `src/views/__tests__/EntryDetailView.test.ts`
  (in a new `deep-link scroll to chunk` describe block):
  1. `?chunk=1` → overlay flips to chunks, `fetchEntryChunks`
     called, `scrollIntoView` called on the badge element. The
     test mounts with `attachTo: document.body` because the
     production code uses `document.querySelector` which only
     finds attached elements.
  2. No `?chunk` → overlay stays in `off`.
  3. `?chunk=not-a-number` → ignored, overlay stays in `off`.

### 6. Routing + sidebar

- **`src/router/index.ts`** — new `/search` route, lazy-loaded
  `SearchView`. Placed between `/entries` and `/entities`.
- **`src/components/layout/AppSidebar.vue`** — new Search nav
  link with a magnifying-glass icon, between Entries and
  Entities. Data-testid `sidebar-search-link`.

### 7. Docs

- **`docs/architecture.md`** — SearchView added to the Views
  section; `entities` and `search` stores added to the Stores
  section (both were missing). EntryDetailView description now
  mentions the `?chunk=N` deep-link contract.
- **`docs/future-features.md`** — left alone. The file has a
  "superseded" banner pointing at `journal-server/docs/roadmap.md`
  as the source of truth.

## Tests and quality gates

- **Before:** 195 tests across 19 files.
- **After:** 229 tests across 23 files. +34 new tests:
  1. `src/api/__tests__/search.test.ts` — 3 (URL construction,
     param stripping, response passthrough).
  2. `src/utils/__tests__/searchSnippet.test.ts` — 9 (empty,
     plain, single mark, multi mark, HTML escaping inside and
     outside marks, unbalanced marker, zero-width span, ellipsis
     passthrough).
  3. `src/stores/__tests__/search.test.ts` — 9 (initial state,
     empty query no-op, happy path, partial overrides, null
     filters omitted, ApiRequestError, Error, non-Error, reset).
  4. `src/views/__tests__/SearchView.test.ts` — 10 (as listed
     above).
  5. `src/views/__tests__/EntryDetailView.test.ts` — 3 new tests
     in the `deep-link scroll to chunk` describe block.

- **Coverage:** 95.49% statements, 89.29% branches, 95.05%
  functions, 96.71% lines. Above the 85% gate. New file coverage:
  `api/search.ts` 87.5% / 100% functions; `stores/search.ts`
  100% lines; `utils/searchSnippet.ts` effectively 100%;
  `views/SearchView.vue` 89.47%.
- **`npm run build`:** passes (vue-tsc + Vite). `SearchView` is
  its own lazy chunk: 8.30 kB raw, 2.96 kB gzipped.
- **`npm run lint`:** clean after one adjustment. ESLint's
  `vue/no-v-html` rule flagged the snippet rendering block — the
  block is safe because every substring passes through
  `renderSnippetHtml` which HTML-escapes everything before
  wrapping matched terms; suppressed inline with the same
  `eslint-disable` comment pattern EntryDetailView already uses
  for its overlay `v-html`.

## Deliberate non-goals for this session

1. **No free-text highlight of the query terms inside semantic
   chunks.** The plan's T1.4.e mentions "snippet of the top
   matching chunk with the query terms visually highlighted".
   For semantic mode I'm only showing the chunk's plain text
   (HTML-escaped) without any query-term highlighting on top —
   the chunk itself already *is* the "here's the matching
   passage" signal and the score+date give the user the context
   they need. Adding query-term highlighting would require
   tokenising the query against the chunk client-side, which is
   meaningful code for a cosmetic win. Punt until a real user
   complaint surfaces.
2. **No debounce-on-type "live search".** The form submits on
   explicit user action (Enter / Search button). The plan
   doesn't call for live search and a per-keystroke fetch would
   hammer the LLM embedding call in semantic mode.
3. **No search history / recent queries list.** Out of plan
   scope, and trivially added later if wanted.
4. **No Search MCP tool for LLM consumers.** The existing
   `journal_search_entries` MCP tool already exposes semantic
   search; a `journal_keyword_search` tool could be added later
   if there's a real use case. This session stays webapp-only.

## Follow-ups

1. **Verify end-to-end in the browser.** The dev proxy to
   `localhost:8400` means this only works when the backend is
   running and has the new endpoint (which it does after
   `264a2b1` on `journal-server/main`). A quick manual check
   against a real corpus is worth doing before the next session.
2. **Legacy multipage entries and chunk scroll.** The risk flagged
   in the tier-1 plan — entries with the old `"\n\n"` page join
   in `final_text` — should still render highlights correctly
   because the stored `char_start`/`char_end` in `entry_chunks`
   were computed against the same text the view is rendering.
   Worth eyeballing once with a legacy multipage entry in the
   corpus.
3. **Search UI item needs its frontend marked shipped in the
   roadmap.** The backend session already marked Item 4 as
   "backend shipped 2026-04-11"; the next commit in
   `journal-server` should flip the "Frontend — still outstanding"
   bullet list to shipped with a pointer to this journal entry.
   That's a one-line edit in `journal-server/docs/roadmap.md`
   and `journal-server/docs/tier-1-plan.md`, but it lives in a
   different repo so it's a follow-up rather than part of this
   worktree's commit.
