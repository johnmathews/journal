# Evaluation Report: Journal Webapp (Greenfield)

## Executive Summary

The journal-webapp is a new project — the directory is empty. This evaluation covers the
technology research and backend audit needed to plan the frontend build. The backend
(journal-server) is well-structured with clean Protocol-based abstractions but needs data
model changes (multi-page entries, OCR correction) and a REST API layer before a webapp
can connect to it.

## Technology Assessment

### Frontend Stack

| Decision          | Choice                      | Rationale                                                  |
|-------------------|-----------------------------|------------------------------------------------------------|
| Framework         | Vue 3.5+ with TypeScript    | User requirement                                           |
| Build tool        | Vite 8 (Rolldown bundler)   | 10-30x faster builds, official Vue tooling                 |
| UI components     | PrimeVue 4.5.x (Aura theme) | Best-in-class DataTable, chart components, extensible      |
| Styling           | PrimeVue styled + tailwindcss-primeui | Polished components out of the box, Tailwind utilities available |
| State management  | Pinia                       | Official Vue state management, Composition API style       |
| Router            | Vue Router 4                | Standard for Vue 3 SPAs                                    |
| Testing           | Vitest + Vue Test Utils + Playwright | Fast unit/component tests + real browser E2E       |
| API mocking       | MSW (Mock Service Worker)   | Intercepts network requests in tests                       |
| Charts (future)   | PrimeVue Chart (Chart.js)   | Built into PrimeVue, covers bar/line/pie/radar             |
| OCR review UI     | PrimeVue Splitter + Textarea | Side-by-side original vs editable, simple and sufficient   |

### Backend Integration

**Key discovery:** The `mcp` Python SDK (which journal-server already uses) includes a
`@mcp.custom_route()` decorator that registers Starlette routes on the same ASGI app as the
MCP server. REST endpoints can run on the **same port (8400)** in the **same process** with
**no new dependencies**.

This is simpler than adding FastAPI (which would require managing lifespan conflicts and ASGI
mounting complexity).

### Backend Data Model Gaps

The current backend is missing several things the webapp needs:

1. **No multi-page entries.** Each image creates a separate `entries` row. Need an
   `entry_pages` table to group images into one logical entry.

2. **No `final_text`.** Only `raw_text` exists. Need an editable `final_text` column where
   `final_text` starts as a copy of `raw_text`. All downstream features (FTS5, ChromaDB
   embeddings, search, analytics) must switch to `final_text`.

3. **No chunk count in SQLite.** Chunks are only in ChromaDB. Need a denormalized
   `chunk_count` column on `entries` to avoid cross-system queries on every list view.

4. **No REST API.** The backend only speaks MCP protocol. The webapp needs standard
   HTTP/JSON endpoints.

5. **FTS5 indexes `raw_text`.** Must be rebuilt to index `final_text`.

## Backend Audit (journal-server)

### Strengths

- Clean layered architecture with Protocol interfaces
- External services (Anthropic, OpenAI, ChromaDB) are swappable
- SQLite migration system works well (PRAGMA user_version)
- Comprehensive test infrastructure with in-memory vector store
- `VectorStore.delete_entry()` already exists, making re-embedding straightforward

### Relevant Architecture Details

- **Service layer is stateless.** `IngestionService` and `QueryService` hold provider
  references but no mutable state. Adding REST handlers that call the same services is trivial.
- **`_process_text` already takes text as a parameter.** Switching from `raw_text` to
  `final_text` requires no signature change — just passing a different field.
- **FTS5 triggers fire on UPDATE.** The existing `entries_au` trigger handles re-indexing
  automatically when `final_text` is updated in SQLite.
- **ChromaDB chunk IDs follow `{entry_id}-{chunk_index}` pattern.** Deletion by entry_id
  is already implemented via metadata filter.

## Assessment Summary

| Dimension                | Rating | Notes                                                |
|--------------------------|--------|------------------------------------------------------|
| Backend readiness        | 3/5    | Well-structured but needs schema changes + REST API  |
| Frontend readiness       | 0/5    | Empty directory, everything to build                 |
| Technology fit           | 5/5    | PrimeVue DataTable is ideal for data-heavy table app |
| Integration complexity   | 3/5    | custom_route simplifies REST; schema migration is moderate |
| Extensibility for future | 4/5    | PrimeVue charts, Pinia stores, Protocol interfaces all support growth |
