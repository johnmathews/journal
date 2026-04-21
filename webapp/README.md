# Journal Webapp

Web interface for the [Journal Analysis Tool](https://github.com/johnmathews/journal-server). Browse journal entries,
review OCR output, and correct transcription errors.

## Running Locally

Three services need to run: ChromaDB (vector database), journal-server (API), and the webapp (frontend).

### Prerequisites

- Python 3.13+ with [uv](https://docs.astral.sh/uv/)
- Node.js 18+ with npm
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

## Features

- **Entry table** — Browse entries with date, page count, word count, chunk count, and ingestion date
- **OCR correction** — Side-by-side view of original OCR text and editable corrected version
- **Re-processing** — Saving corrections triggers re-chunking, re-embedding, and FTS5 rebuild on the backend

## Docker (production)

```bash
docker compose up
```

Runs the full stack: webapp (port 8402), journal-server (port 8400), ChromaDB (port 8401).

## Development

See [docs/development.md](docs/development.md) for setup, commands, project structure, and guides.

See [docs/architecture.md](docs/architecture.md) for technical architecture.

See [docs/deployment.md](docs/deployment.md) for Docker, nginx, and production deployment.

See [docs/future-features.md](docs/future-features.md) for planned features and required backend changes.

## Tech Stack

Vue 3 · TypeScript · Vite · PrimeVue · Pinia · Chart.js · Vitest
