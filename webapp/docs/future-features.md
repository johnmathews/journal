# Future Features

> **Superseded 2026-04-11 by [`journal-server/docs/roadmap.md`](../../journal-server/docs/roadmap.md).**
> The consolidated roadmap pulls together this file, `phase-2-brief.md`,
> the pending task list, and deferred items from recent journal entries
> into a single source of truth. The items below are still tracked there
> (mostly in Tier 1 Search UI / Dashboards and Tier 3 polish items) —
> do not add new work here.
>
> **Note:** the "Phase 2: Authentication" section below is obsolete. The
> backend shipped bearer-token auth in the 2026-04-11 security session
> and the webapp already sends `Authorization: Bearer <token>`. See
> roadmap deferred item D7 for what remains (at most a settings page for
> user-supplied tokens).

Planned features and the backend changes they require. Features are roughly ordered by priority.

## Phase 2: Authentication

**Frontend:**
- Login page with username/password
- Auth token storage (localStorage or httpOnly cookie)
- Route guards for protected pages
- Logout functionality

**Backend changes required:**
- User table and password hashing
- JWT or session-based auth middleware on REST API endpoints
- Auth middleware on MCP endpoints (or separate auth strategy for LLM clients)

## Phase 2: Dashboards

**Frontend:**
- Dashboard view with Chart.js 4 rendered directly via `src/utils/chartjs-config.ts` (styled to match the Mosaic chart aesthetic)
- Writing frequency chart (entries per week/month over time)
- Word count trends (average words per entry over time)
- Mood trends visualization (line chart with multi-dimensional mood scores)
- Topic frequency bar chart (most mentioned people, places, themes)

**Backend changes required:**
- `GET /api/mood-trends` — REST endpoint wrapping existing `QueryService.get_mood_trends()`
- `GET /api/topic-frequency/{topic}` — REST endpoint wrapping `QueryService.get_topic_frequency()`
- `GET /api/writing-frequency` — New endpoint for entries-per-period aggregation
- Consider caching for expensive queries

## Phase 3: Search UI

**Frontend:**
- Search page with text input and results list
- Semantic search (uses embedding model) with relevance scores
- Keyword search (uses FTS5) as alternative mode
- Result highlighting showing matching chunks
- Date range filtering on search results

**Backend changes required:**
- `GET /api/search` — REST endpoint wrapping `QueryService.search_entries()`
- `GET /api/search/keyword` — REST endpoint wrapping FTS5 `search_text()`
- Consider returning chunk highlights in search results

## Phase 3: People / Places / Tags Browser

**Frontend:**
- Entity browser view showing extracted people, places, and tags
- Click an entity to see all entries mentioning it
- Entity timeline (when were they first/last mentioned)

**Backend changes required:**
- `GET /api/people` — List all people with entry counts
- `GET /api/places` — List all places with entry counts
- `GET /api/tags` — List all tags with entry counts
- `GET /api/people/{id}/entries` — Entries mentioning a person

## Phase 4: Multi-Page Ingestion UI

**Frontend:**
- Drag-and-drop multiple images
- Reorder pages before ingestion
- Preview OCR text per page
- Submit as single multi-page entry

**Backend changes required:**
- Multi-page ingestion REST endpoint (wrapping existing `ingest_multi_page_entry`)
- File upload endpoint (currently ingestion is via base64 or URL)

## Phase 3: Low-Confidence OCR Highlighting

The OCR editor already runs a live diff between `raw_text` and `final_text` (via `useDiffHighlight` + the mirror-div overlay in `EntryDetailView.vue`). A natural extension is to also highlight regions of the original OCR that the model marked as low-confidence — typically proper names, unusual punctuation, or messy handwriting where the OCR result is most likely wrong.

**Frontend:**
- Render a second kind of highlight span in the Original panel — e.g. a dashed underline in amber — alongside the existing diff-delete highlights. `useDiffHighlight` returns segments as `{kind, text}` tuples specifically so multiple span sources can be merged before rendering.
- Legend updates to include the new "low confidence" swatch
- Optional: click a low-confidence span to jump the editor's caret to the same offset in the corrected panel

**Backend changes required:**
- Ask the OCR provider (Anthropic Claude) to return per-region confidence metadata alongside the extracted text. Store it on `entries` (new column, probably JSON) or on `entry_pages` per-page.
- Extend `GET /api/entries/{id}` to include the confidence spans — either as character offsets into `raw_text` or as a parallel structure.
- Consider how the data migrates when the user edits `final_text` — once a correction has been made the original span may no longer be relevant.

## Phase 4: Voice Note Playback

**Frontend:**
- Audio player alongside transcript in entry detail view
- Timestamp markers synced with transcript sections

**Backend changes required:**
- `GET /api/entries/{id}/audio` — Serve original audio file
- Store audio file path/URL in source_files table (already exists)

## Phase 5: Export

**Frontend:**
- Export button on entry list (export filtered entries)
- Format options: Markdown, PDF, JSON

**Backend changes required:**
- `GET /api/export` — Export entries in requested format
- Markdown/PDF rendering on server side
