# Journal Webapp

Web interface for the [Journal Analysis Tool](https://github.com/johnmathews/journal-server). Browse journal entries,
review OCR output, and correct transcription errors.

## Features

- **Entry table** — Browse entries with date, page count, word count, chunk count, and ingestion date
- **OCR correction** — Side-by-side view of original OCR text and editable corrected version
- **Re-processing** — Saving corrections triggers re-chunking, re-embedding, and FTS5 rebuild on the backend

## Quick Start

```bash
npm install
npm run dev
```

Requires [journal-server](https://github.com/johnmathews/journal-server) running on `localhost:8400`.

## Docker

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
