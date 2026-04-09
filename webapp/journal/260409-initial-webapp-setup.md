# 260409 — Initial Webapp Setup

## Context

The journal-server existed as an MCP tool server + CLI with no web interface. Journal entries were ingested via Slack (through Nanoclaw) and queried via LLM clients or the CLI. There was no way to visually browse entries or correct OCR mistakes without an LLM in the loop.

The goal was to build a simple, extensible webapp that could grow to include dashboards, search, entity browsing, and more. The first feature set focuses on the basics: browsing entries and correcting OCR errors.

## What was built

### Frontend (this repo)

- **Project**: Vue 3 + TypeScript + Vite 8 + PrimeVue 4.5 (Aura theme) + Pinia
- **Entry list table**: PrimeVue DataTable with server-side pagination, columns for date, pages, words, chunks, and ingestion date. Click a row to navigate to detail view.
- **OCR correction view**: Side-by-side Splitter with read-only original OCR text and editable corrected text. Saving triggers re-chunking, re-embedding, and FTS5 rebuild on the backend. Dirty state tracking warns before navigating away with unsaved changes.
- **API client layer**: Typed fetch wrappers with error handling, Pinia store for state management
- **Tests**: 28 tests covering API client, Pinia store, composable (useEntryEditor), and component rendering
- **CI/CD**: GitHub Actions builds and pushes Docker image to ghcr.io on push to main
- **Docker**: Multi-stage build (Node 22 → nginx alpine), nginx handles SPA routing and API proxy

### Backend changes (journal-server)

These changes were made in the journal-server repo as part of this work:

- **Multi-page entries**: New `entry_pages` table. Multiple images can be ingested as a single journal entry. Each page stores its own OCR text; the entry stores the combined text.
- **OCR correction**: Added `final_text` column to entries (alongside immutable `raw_text`). All downstream features (FTS5, ChromaDB embeddings, search, analytics) use `final_text`. Editing triggers re-processing.
- **REST API**: 4 endpoints added via `mcp.custom_route()` on the same port as the MCP server. No new framework dependency needed.
- **Schema migration 0002**: Adds columns, creates table, backfills data, rebuilds FTS5 index
- **New MCP tools**: `journal_ingest_multi_page`, `journal_update_entry_text`
- **New CLI commands**: `ingest-multi`, `backfill-chunks`
- **158 tests passing**

## Key design decisions

1. **PrimeVue over Vuetify**: PrimeVue's DataTable is more capable for data-heavy apps (virtual scrolling, inline editing, column resizing, lazy loading). It also includes Chart.js wrappers for the future dashboard features. The Aura theme gives a polished look out of the box.

2. **`mcp.custom_route()` over FastAPI**: The MCP Python SDK already uses Starlette internally. The `custom_route` decorator registers Starlette routes on the same ASGI app, so REST endpoints run on the same port (8400) in the same process. This avoids adding FastAPI as a dependency and sidesteps documented lifespan conflicts between FastMCP and FastAPI.

3. **`final_text` on the entries table** (not a separate revisions table): It's a 1:1 relationship — one editable text per entry. A revisions table would add complexity for no benefit since we don't need edit history, just the original vs current.

4. **Denormalized `chunk_count`**: Chunks live in ChromaDB. Querying ChromaDB per-entry for every list view would be slow. Storing chunk_count in SQLite makes it a free column on every query.

5. **nginx API proxy in production**: The webapp and API appear as the same origin to the browser, eliminating CORS concerns. During development, Vite's proxy serves the same purpose.

## What's next

- Phase 2: Authentication (JWT/session-based) and dashboards (mood trends, writing frequency, topic frequency charts via PrimeVue Chart)
- Phase 3: Search UI (semantic + keyword) and entity browser (people, places, tags)
- See `docs/future-features.md` for the full roadmap with backend change requirements
