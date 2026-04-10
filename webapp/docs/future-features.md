# Future Features

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
