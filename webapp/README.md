# Journal Webapp

Web frontend for the [Journal Analysis Tool](https://github.com/johnmathews/journal-server) — a personal journal
insight engine that ingests handwritten pages (OCR) and voice notes (transcription), then lets you browse, correct,
search, and analyze your journal entries.

<!-- TODO: Add screenshots
![Dashboard](docs/screenshots/dashboard.png)
![Entry Editor](docs/screenshots/entry-editor.png)
-->

## Features

**Dashboard** — Writing frequency heatmap, word count trends, mood scoring charts with drill-down to individual
entries, and entity distribution breakdowns. Configurable date range and binning (day/week/month). Drag-and-drop
tile reordering with server-persisted layout.

**Entry Browser** — Sortable, paginated table with configurable columns (date, source type, word count, page count,
doubts, language, entities). Column visibility and order are drag-and-drop reorderable and persisted per-user.

**OCR/Transcription Editor** — Side-by-side view of original OCR or transcription text alongside an editable
corrected version with live diff highlighting. Review mode highlights words the OCR/transcription model flagged
as uncertain, with prev/next navigation. Saving triggers background re-chunking, re-embedding, and entity
extraction.

**Reading Mode** — Clean, single-column serif layout for reading corrected entries without the editing UI.

**Chunk & Token Overlay** — Visualize how the embedding model chunks your text, with overlap regions highlighted.
Token-level view shows individual tokenizer boundaries. Deep-linkable from search results.

**Search** — Keyword search (SQLite FTS5) and semantic search (vector similarity via ChromaDB). Semantic results
show per-chunk similarity scores and explanatory context. Results link directly to the matching chunk in the entry.

**Entity Tracking** — Browse extracted people, places, activities, organizations, and topics across your journal.
Entity detail pages show relationships, mention timelines, and quotes. Click an entity chip on any entry to
highlight all occurrences in the text. Merge duplicate entities with a review queue for AI-suggested candidates.

**Mood Scoring** — Multi-dimensional mood analysis with trend charts. Drill down into any data point to see
the individual entries and the model's scoring rationale.

**Entry Creation** — Upload handwritten page photos, import text/audio files, type a text entry directly, or
record voice notes in-browser with a live waveform visualizer and wake-lock support.

**Notifications** — Pushover integration for job completion alerts (ingestion, entity extraction, mood scoring)
with per-topic enable/disable toggles.

**Background Jobs** — Monitor ingestion, entity extraction, mood scoring, and re-embedding jobs in real time
with a notification bell and a full job history page.

**Settings** — View server health, configure pipeline settings (OCR model, transcription model, chunking
parameters, mood scoring), see per-step cost estimates, and manage API pricing.

**Multi-user Auth** — Session-based authentication with registration, email verification, password reset,
and admin roles. API key management for programmatic access.

## Tech Stack

| Technology         | Purpose                                    |
|--------------------|--------------------------------------------|
| Vue 3.5+           | UI framework (Composition API, script setup) |
| TypeScript         | Type safety                                |
| Vite               | Build tool and dev server                  |
| Tailwind CSS 4     | Utility-first styling, CSS-first config    |
| Pinia              | State management                           |
| Vue Router         | Client-side routing                        |
| Chart.js 4         | Dashboard charts                           |
| diff-match-patch   | Live diff highlighting in the OCR editor   |
| Vitest             | Unit and component testing (1100+ tests)   |

## Running Locally

Three services need to run: ChromaDB (vector database), journal-server (API), and the webapp (frontend).

### Prerequisites

- Python 3.13+ with [uv](https://docs.astral.sh/uv/)
- Node.js 22+ with npm
- Docker (for ChromaDB)

### 1. Create environment files

**journal-server/.env** (copy from `.env.example`):

```bash
cd ../journal-server
cp .env.example .env
```

Required values in `.env`:

```
JOURNAL_API_TOKEN=<generate with: python -c "import secrets; print(secrets.token_urlsafe(32))">
JOURNAL_SECRET_KEY=<generate with: python -c "import secrets; print(secrets.token_urlsafe(32))">
CHROMADB_HOST=localhost
CHROMADB_PORT=8401
MCP_HOST=0.0.0.0
MCP_PORT=8400
API_CORS_ORIGINS=http://localhost:5173
```

Real API keys (`ANTHROPIC_API_KEY`, `OPENAI_API_KEY`) are only needed for ingestion — not for browsing seeded data.

**journal-webapp/.env.local** (copy from `.env.example`):

```bash
cp .env.example .env.local
```

Set `VITE_JOURNAL_API_TOKEN` to the same value as `JOURNAL_API_TOKEN` in the server `.env`. Leave `VITE_API_URL` blank.

### 2. Start services (three terminals)

**Terminal 1 — ChromaDB:**

```bash
cd ../journal-server
docker compose -f docker-compose.dev.yml up -d
```

**Terminal 2 — Journal Server (port 8400):**

```bash
cd ../journal-server
uv sync
uv run journal seed   # populate sample data (no API keys needed)
set -a && source .env && set +a && uv run python -m journal.mcp_server
```

**Terminal 3 — Webapp (port 5173):**

```bash
npm install
npm run dev
```

Open http://localhost:5173 in your browser.

> **Note:** The server reads config from environment variables, not from `.env` directly. The
> `set -a && source .env && set +a` prefix exports the variables into the shell before starting.

### 3. Create a user account

The seeded entries belong to the default admin user. To see them in the webapp, register a new user,
promote them to admin, verify their email, and reassign the entries:

```bash
# Register
curl -s -X POST http://localhost:8400/api/auth/register \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <your-JOURNAL_API_TOKEN>" \
  -d '{"email":"test@test.com","password":"testpass123","display_name":"Bilbo"}'

# Promote to admin, verify email, and reassign entries
sqlite3 ../journal-server/journal.db \
  "UPDATE users SET is_admin=1, email_verified=1 WHERE email='test@test.com';
   UPDATE entries SET user_id = (SELECT id FROM users WHERE email='test@test.com');"
```

Restart the server, then log in at http://localhost:5173 with `test@test.com` / `testpass123`.

> **Resetting:** To start fresh, delete `journal.db` in the server directory and repeat from
> `uv run journal seed` onwards.

## Development

```bash
npm run dev            # Dev server (port 5173, proxies /api to localhost:8400)
npm run build          # Type-check and production build
npm run test:unit      # Run tests
npm run test:coverage  # Tests + coverage report
npm run lint           # ESLint
npm run format         # Prettier
```

See [docs/development.md](docs/development.md) for detailed development guide.

See [docs/architecture.md](docs/architecture.md) for technical architecture and conventions.

See [docs/deployment.md](docs/deployment.md) for Docker, nginx, and production deployment.

## Docker (production)

```bash
docker compose up
```

Runs the full stack: webapp (port 8402), journal-server (port 8400), ChromaDB (port 8401).

## Project Structure

```
src/
  api/              — Typed fetch wrappers for the REST API
  assets/           — Tailwind CSS entry point and utility patterns
  components/       — Reusable components (modals, panels, layout shell)
  composables/      — Composition functions (editor, diff, overlay, toast)
  layouts/          — DefaultLayout (sidebar + header + content slot)
  router/           — Vue Router configuration
  stores/           — Pinia stores (entries, entities, search, dashboard, etc.)
  types/            — TypeScript interfaces matching API response schemas
  utils/            — Pure helpers (chart config, search snippets, entity names)
  views/            — Page components, one per route
```

## Related

- [journal-server](https://github.com/johnmathews/journal-server) — Python backend (REST API + MCP server + CLI)
