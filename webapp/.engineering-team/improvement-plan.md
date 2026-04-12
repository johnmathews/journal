# Implementation Plan: Journal Webapp + Backend Changes

## Overview

Two repositories are affected:
- **journal-server** (backend): Data model migration, REST API, service layer changes
- **journal-webapp** (frontend): New Vue 3 project from scratch

Work units are ordered by dependency. Backend changes must land first since the frontend
depends on the REST API.

---

## Phase A: Backend Changes (journal-server)

### Work Unit 1: Data Model Migration
**Priority:** Critical
**Dependencies:** None

**Changes:**
- `src/journal/db/migrations/0002_multi_page_and_correction.sql` (NEW)
  - `ALTER TABLE entries ADD COLUMN final_text TEXT`
  - `ALTER TABLE entries ADD COLUMN chunk_count INTEGER NOT NULL DEFAULT 0`
  - Backfill: `UPDATE entries SET final_text = raw_text`
  - Create `entry_pages` table (id, entry_id, page_number, raw_text, source_file_id, created_at)
  - Migrate existing OCR entries into `entry_pages` (one page per entry, page_number=1)
  - Drop old FTS5 triggers and table
  - Recreate FTS5 on `final_text` with new triggers (UPDATE trigger scoped to `final_text` column)
  - Rebuild FTS index from existing data

- `src/journal/models.py` (MODIFY)
  - Add `final_text: str` and `chunk_count: int = 0` to `Entry` dataclass
  - Add `EntryPage` dataclass (id, entry_id, page_number, raw_text, source_file_id, created_at)
  - Rename `SearchResult.raw_text` to `SearchResult.text` (it now carries `final_text`)

- `src/journal/db/repository.py` (MODIFY)
  - Update `_row_to_entry` to include `final_text` and `chunk_count`
  - Update `create_entry` to accept and store `final_text` (defaults to `raw_text`)
  - Add methods: `update_final_text()`, `add_entry_page()`, `get_entry_pages()`, `update_chunk_count()`

- Tests: Update all existing tests that create/assert on Entry objects

**Acceptance criteria:**
- Migration runs cleanly on existing database
- All existing tests pass with updated Entry fields
- New repository methods have tests

### Work Unit 2: Service Layer — Multi-Page Ingestion + OCR Correction
**Priority:** Critical
**Dependencies:** Work Unit 1

**Changes:**
- `src/journal/services/ingestion.py` (MODIFY)
  - Modify `ingest_image`: set `final_text = raw_text`, insert `entry_pages` row, update `chunk_count` after processing
  - Modify `ingest_voice`: set `final_text = raw_text`, update `chunk_count`
  - Modify `ingest_image_from_url`: same changes as `ingest_image`
  - Modify `ingest_voice_from_url`: same changes as `ingest_voice`
  - Modify `_process_text` (or callers): return chunk count so callers can store it
  - Add `ingest_multi_page_entry(images: list[tuple[bytes, str]], date: str) -> Entry`:
    OCR each image, concatenate texts, create single entry + pages, chunk and embed
  - Add `update_entry_text(entry_id: int, final_text: str) -> Entry`:
    Update SQLite, delete old ChromaDB chunks, re-chunk, re-embed, update chunk_count

- `src/journal/services/query.py` (MODIFY)
  - `search_entries`: use `entry.final_text` in SearchResult
  - Add `get_entry_pages(entry_id: int) -> list[EntryPage]`

**Acceptance criteria:**
- `ingest_multi_page_entry` creates one entry with N pages, correct combined text
- `update_entry_text` updates final_text, re-embeds, updates chunk_count
- Search returns `final_text` content, not `raw_text`
- Existing single-image and voice ingestion still work

### Work Unit 3: REST API Endpoints
**Priority:** Critical
**Dependencies:** Work Unit 2

**Changes:**
- `src/journal/api.py` (NEW)
  - `GET /api/entries` — list entries with pagination, date filtering
    Response: `{ items: [EntrySummary], total, limit, offset }`
    EntrySummary: id, entry_date, source_type, page_count, word_count, chunk_count, created_at
  - `GET /api/entries/{id}` — single entry with full text
    Response: EntryDetail (id, entry_date, source_type, raw_text, final_text, page_count,
    word_count, chunk_count, language, created_at, updated_at)
  - `PATCH /api/entries/{id}` — update final_text, triggers re-processing
    Request: `{ final_text: string }`
    Response: updated EntryDetail
  - `GET /api/stats` — statistics summary
    Response: Statistics object
  - Error format: `{ error: string, message: string }` with 400/404/500 codes
  - Register all routes via `mcp.custom_route()` decorator

- `src/journal/config.py` (MODIFY)
  - Add `api_cors_origins: list[str]` from `API_CORS_ORIGINS` env var

- `src/journal/mcp_server.py` (MODIFY)
  - Import and call route registration from `api.py`
  - Replace `mcp.run()` with manual Starlette app construction + CORS middleware + uvicorn
  - CORS allows configurable origins (default: none; dev: `http://localhost:5173`)

- `docker-compose.yml` (MODIFY)
  - Add `API_CORS_ORIGINS` environment variable

- `tests/test_api.py` (NEW)
  - Test all 4 endpoints using Starlette TestClient
  - Test pagination, date filtering, 404 responses, validation errors
  - Test that PATCH triggers re-embedding (verify chunk_count changes)

**Acceptance criteria:**
- All 4 endpoints return correct JSON responses
- CORS headers present in responses when configured
- MCP server still works alongside REST endpoints
- All tests pass

### Work Unit 4: MCP Tool + CLI Updates
**Priority:** High
**Dependencies:** Work Unit 2

**Changes:**
- `src/journal/mcp_server.py` (MODIFY)
  - All tools use `final_text` in output instead of `raw_text`
  - New tool: `journal_ingest_multi_page` (accept multiple images)
  - New tool: `journal_update_entry_text` (edit final_text, trigger re-processing)

- `src/journal/cli.py` (MODIFY)
  - All commands display `final_text` in output
  - Update `cmd_ingest` to show `final_text` preview

**Acceptance criteria:**
- MCP tools return final_text content
- New tools work correctly
- CLI displays final_text

### Work Unit 5: Backend Documentation + Journal
**Priority:** Medium
**Dependencies:** Work Units 1-4

**Changes:**
- `docs/architecture.md` (MODIFY)
  - Document multi-page entry model
  - Document REST API layer alongside MCP
  - Update data flow diagrams
  - Document `raw_text` vs `final_text` distinction

- `docs/api.md` (MODIFY)
  - Add REST API endpoint reference (alongside MCP tools)
  - Document CORS configuration

- `docs/configuration.md` (MODIFY)
  - Add `API_CORS_ORIGINS` env var documentation

- `journal/YYMMDD-multi-page-and-rest-api.md` (NEW)
  - Development journal entry documenting the changes

**Acceptance criteria:**
- All new features documented
- Architecture docs reflect new data model
- API reference covers REST endpoints

---

## Phase B: Frontend (journal-webapp)

### Work Unit 6: Project Setup
**Priority:** Critical
**Dependencies:** None (can start in parallel with backend work)

**Changes:**
- Initialize git repo in `/Users/john/projects/journal/journal-webapp`
- Scaffold Vue 3 + Vite 8 + TypeScript project via `npm create vue@latest`
  - Enable: TypeScript, Vue Router, Pinia, Vitest, ESLint, Prettier
- Install PrimeVue 4.5.x + @primeuix/themes + tailwindcss-primeui
- Install Chart.js (peer dependency for future charts)
- Configure PrimeVue with Aura preset in main.ts
- Configure ESLint 9 flat config
- Set up path alias (`@/*` -> `./src/*`)
- Create directory structure:
  ```
  src/
    api/            — API client layer
    assets/         — Static resources
    components/     — Global reusable components
    composables/    — Composition functions
    layouts/        — Page layout components
    router/         — Route configuration
    stores/         — Pinia stores
    types/          — TypeScript type definitions
    utils/          — Pure utility functions
    views/          — Page components
    App.vue         — Root component with layout
    main.ts         — App entry point
  ```
- Create GitHub Actions workflow for GHCR image push
- Create Dockerfile (nginx-based for static SPA)
- Create docker-compose.yml for local dev

**Acceptance criteria:**
- `npm run dev` starts the app on localhost:5173
- `npm run build` produces production build
- `npm run test:unit` runs (with no tests yet, exits cleanly)
- `npm run lint` passes
- Git repo initialized with initial commit

### Work Unit 7: API Client Layer + Types
**Priority:** Critical
**Dependencies:** Work Unit 3 (REST API must be defined), Work Unit 6

**Changes:**
- `src/types/entry.ts` (NEW)
  - `EntrySummary` interface matching GET /api/entries response items
  - `EntryDetail` interface matching GET /api/entries/{id} response
  - `EntryListResponse` interface (items, total, limit, offset)
  - `Statistics` interface matching GET /api/stats response
  - `PaginationParams`, `DateFilterParams` types

- `src/api/client.ts` (NEW)
  - Base fetch wrapper with error handling
  - `API_BASE_URL` from env var (Vite's `import.meta.env.VITE_API_URL`)

- `src/api/entries.ts` (NEW)
  - `fetchEntries(params): Promise<EntryListResponse>`
  - `fetchEntry(id): Promise<EntryDetail>`
  - `updateEntryText(id, finalText): Promise<EntryDetail>`
  - `fetchStats(): Promise<Statistics>`

- `src/stores/entries.ts` (NEW) — Pinia store
  - State: entries list, current entry, loading flags, pagination state
  - Actions: loadEntries, loadEntry, saveEntryText
  - Getters: computed pagination info

- Tests:
  - Unit tests for API client functions (with MSW mocks)
  - Unit tests for Pinia store

**Acceptance criteria:**
- API functions return typed responses
- Pinia store manages loading/error/success states
- Tests cover happy path and error cases

### Work Unit 8: Entry List Table View
**Priority:** Critical
**Dependencies:** Work Unit 7

**Changes:**
- `src/views/EntryListView.vue` (NEW)
  - PrimeVue DataTable with columns: Date, Pages, Words, Chunks, Date Ingested
  - Server-side pagination (lazy loading via DataTable's `lazy` prop)
  - Date range filtering (PrimeVue DatePicker for start/end)
  - Sortable columns
  - Click row to navigate to entry detail
  - Loading skeleton while fetching

- `src/layouts/DefaultLayout.vue` (NEW)
  - App shell with navigation sidebar (initially just "Entries" link)
  - Responsive layout (sidebar collapses on mobile)
  - Extensible — future nav items (Dashboards, Settings) slot in here

- `src/router/index.ts` (MODIFY)
  - Route: `/` -> EntryListView
  - Route: `/entries/:id` -> EntryDetailView (Work Unit 9)

- `src/App.vue` (MODIFY)
  - Use DefaultLayout as wrapper

- Tests:
  - Component test for EntryListView with mocked API responses
  - Test pagination, loading state, row click navigation

**Acceptance criteria:**
- Table displays entries with all 5 columns
- Pagination works (page forward/back, rows per page)
- Date filtering works
- Clicking a row navigates to detail view
- Loading state shown while fetching

### Work Unit 9: Entry Detail + OCR Correction View
**Priority:** Critical
**Dependencies:** Work Unit 8

**Changes:**
- `src/views/EntryDetailView.vue` (NEW)
  - Header: entry date, source type, word count, chunk count
  - PrimeVue Splitter with two panels:
    - Left panel: `raw_text` (read-only Textarea, label: "Original OCR")
    - Right panel: `final_text` (editable Textarea, label: "Corrected Text")
  - Save button: calls PATCH endpoint, shows success/error toast
  - Visual indicator when `final_text` differs from `raw_text` (e.g., "Modified" badge)
  - Back button to return to list
  - PrimeVue Toast for save confirmation

- `src/composables/useEntryEditor.ts` (NEW)
  - Manages editor state: original text, edited text, dirty tracking, save logic
  - Handles the PATCH call and updates the Pinia store on success

- Tests:
  - Component test: renders both panels with correct text
  - Component test: editing text marks as dirty, save button enables
  - Component test: save calls API and shows toast
  - Test unsaved changes warning (browser beforeunload)

**Acceptance criteria:**
- Side-by-side view shows raw_text and final_text
- Editing final_text and saving triggers re-processing
- Success/error feedback via toast
- Dirty state tracked (warn on unsaved navigation)

### Work Unit 10: Frontend Documentation + Journal
**Priority:** Medium
**Dependencies:** Work Units 6-9

**Changes:**
- `docs/architecture.md` (NEW)
  - Frontend architecture overview
  - Component hierarchy
  - API integration pattern
  - State management approach
  - Testing strategy

- `docs/development.md` (NEW)
  - Local development setup
  - Project structure guide
  - Adding new views/features guide
  - Environment variables reference

- `docs/future-features.md` (NEW)
  - Planned features requiring backend changes:
    - **Dashboards**: mood trends charts, writing frequency, word count trends
      (backend: REST endpoints for mood_trends, topic_frequency)
    - **People/places/tags viewer**: browse extracted entities
      (backend: REST endpoints for people, places, tags with entry links)
    - **Search UI**: semantic + keyword search with result highlighting
      (backend: REST search endpoint wrapping existing QueryService)
    - **Voice note playback**: play original audio alongside transcript
      (backend: serve source files via REST, or store URLs)
    - **Multi-page ingestion UI**: drag-and-drop multiple images, reorder pages
      (backend: multi-page ingestion endpoint already planned)
    - **Authentication**: JWT or session-based auth for all endpoints
      (backend: auth middleware on REST + MCP endpoints)
    - **Export**: download entries as PDF/markdown
      (backend: export endpoint with format parameter)

- `journal/YYMMDD-initial-webapp-setup.md` (NEW)
  - Development journal entry

- `README.md` (NEW)
  - Project overview, setup instructions, development guide

**Acceptance criteria:**
- All docs complete and accurate
- Future features documented with backend change requirements
- README sufficient for a new developer to get started

### Work Unit 11: CI/CD + Docker
**Priority:** High
**Dependencies:** Work Unit 6

**Changes:**
- `.github/workflows/ci.yml` (NEW)
  - Trigger: push to main
  - Steps: install deps, lint, test, build
  - Push Docker image to `ghcr.io/johnmathews/journal-webapp`

- `Dockerfile` (NEW)
  - Multi-stage: node build stage + nginx serve stage
  - Serve built SPA from nginx
  - Environment variable injection for API URL at runtime

- `docker-compose.yml` (NEW)
  - webapp service pointing to Dockerfile
  - Port mapping (e.g., 8402:80)
  - `VITE_API_URL` env var pointing to journal-server

- `.dockerignore` (NEW)
- `.gitignore` (NEW/MODIFY)

**Acceptance criteria:**
- `docker compose up` serves the webapp
- GitHub Actions workflow builds and pushes image
- Production build works with configurable API URL

---

## Execution Order

```
Phase A (backend):  WU1 → WU2 → WU3 ──→ WU4 → WU5
                                  ↑
Phase B (frontend): WU6 ──→ WU7 ─┘→ WU8 → WU9 → WU10
                     └──→ WU11 (parallel with WU7+)
```

WU6 (frontend project setup) can start immediately in parallel with backend work.
WU7 (API client) needs WU3 (REST API design) to be finalized but not necessarily deployed.
WU11 (CI/CD) can run in parallel with feature development.

## Resolved Decisions

1. **Multi-page ingestion**: Explicit batching via new MCP tool / REST endpoint.
   Auto-grouping by date may come later as an enhancement.

2. **Chunk count backfill**: Implement a `journal backfill-chunks` CLI command that
   queries ChromaDB and updates SQLite. Run once after deploying the migration.

3. **Webapp deployment**: Same media VM as journal-server. Built via GitHub Actions,
   pushed to `ghcr.io/johnmathews/journal-webapp`. The docker-compose stack on the
   media VM pulls the image.
