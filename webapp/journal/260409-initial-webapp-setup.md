# 260409 — Initial Webapp Setup

## What was built

Set up the journal-webapp as a new Vue 3 project with PrimeVue, connecting to journal-server's new REST API.

### Frontend
- Vue 3 + TypeScript + Vite 8 + PrimeVue 4.5 (Aura theme) + Pinia
- Entry list table with PrimeVue DataTable: date, pages, words, chunks, date ingested
- Entry detail view with side-by-side OCR correction (Splitter + Textarea)
- API client layer with typed fetch wrappers
- Pinia store for entry state management
- 28 tests (API client, store, composable, component tests)
- CI/CD: GitHub Actions → ghcr.io, Docker with nginx

### Backend (journal-server)
- Multi-page entry support (entry_pages table, batch ingestion)
- OCR correction (raw_text + final_text, re-embedding on edit)
- REST API (4 endpoints via custom_route, same port as MCP)
- Schema migration 0002
- 158 tests

## Key decisions

- **PrimeVue over Vuetify**: Better DataTable for data-heavy app, built-in Chart.js wrapper for future dashboards
- **custom_route over FastAPI**: No new dependency, no lifespan conflicts, same port
- **final_text on entries table**: 1:1 with entry, no join overhead, simple update path
- **Vite proxy for dev**: Avoids CORS in development, nginx proxy in production

## What's next

Phase 2: Authentication + dashboards (mood trends, writing frequency charts)
