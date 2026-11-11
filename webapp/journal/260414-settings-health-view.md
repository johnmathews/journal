# Settings & Health view

## What changed

Added a new Settings & Health page accessible from the sidebar. The view
has two sections:

### Health section
Displays data from the existing `/health` endpoint:
- Overall status (ok/degraded/error) with color coding
- Server uptime
- Total entries and chunks
- Per-component checks (SQLite, ChromaDB, API keys)
- Ingestion stats (last 7d/30d, avg words/chunks per entry)

### Configuration section
Displays data from the new `GET /api/settings` server endpoint:
- OCR provider and model (e.g. gemini / gemini-3-pro)
- Transcription and embedding models
- Chunking strategy and parameters
- Feature flags (mood scoring, author name)

### Implementation
- Types: `src/types/settings.ts`
- API module: `src/api/settings.ts` (fetchSettings + fetchHealth)
- Store: `src/stores/settings.ts` (loads both in parallel)
- View: `src/views/SettingsView.vue`
- Route: `/settings`
- Sidebar: gear icon link after Job History
- Vite proxy: added `/health` alongside `/api`

### Testing
- 2 API tests (correct URL calls)
- 5 store tests (initial state, load, errors, ApiRequestError, non-Error)
- 11 view tests (heading, loading, error, health status, degraded,
  uptime, component checks, ingestion stats, OCR display, settings
  section, mood scorer conditional)

Coverage thresholds maintained: Statements 91.65%, Branches 85.56%,
Functions 90.19%, Lines 93.26%.
