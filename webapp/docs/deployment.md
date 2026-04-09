# Deployment

## Overview

The journal-webapp is a static SPA served by nginx. In production it runs as a Docker container alongside journal-server and ChromaDB on the media VM.

## Docker Image

Built by GitHub Actions on push to `main` and pushed to `ghcr.io/johnmathews/journal-webapp`.

The image uses a multi-stage build:
1. **Build stage** (Node 22 alpine): installs deps, runs `npm run build`
2. **Production stage** (nginx alpine): serves the built static files

## nginx Configuration

The `nginx.conf` handles three concerns:

- **SPA routing**: All non-file routes serve `index.html` (Vue Router handles client-side routing)
- **API proxy**: `/api/*` requests are proxied to journal-server (`http://journal:8400`)
- **Static asset caching**: Files under `/assets/` get 1-year cache headers (Vite hashes filenames)

In production, nginx proxies API requests directly to the journal-server container. No CORS configuration is needed because the browser sees the same origin for both the webapp and the API.

During development, Vite's dev server proxy serves the same purpose (see `vite.config.ts`).

## docker-compose Stack

The `docker-compose.yml` defines the full stack for local or VM deployment:

| Service     | Image                                       | Port  | Purpose                    |
|-------------|---------------------------------------------|-------|----------------------------|
| `webapp`    | Built from Dockerfile                       | 8402  | Vue SPA (nginx)            |
| `journal`   | `ghcr.io/johnmathews/journal-server:latest` | 8400  | Backend (MCP + REST API)   |
| `chromadb`  | `chromadb/chroma:latest`                    | 8401  | Vector database            |

### Environment Variables

The journal-server container needs these environment variables (configured in docker-compose or on the host):

| Variable            | Description                                     |
|---------------------|-------------------------------------------------|
| `DB_PATH`           | SQLite database path inside container            |
| `CHROMADB_HOST`     | ChromaDB hostname (use `chromadb` in compose)    |
| `CHROMADB_PORT`     | ChromaDB port (8000 internal)                    |
| `ANTHROPIC_API_KEY` | For OCR (Claude vision)                          |
| `OPENAI_API_KEY`    | For transcription + embeddings                   |
| `API_CORS_ORIGINS`  | Not needed in production (nginx proxies same-origin) |

The webapp container has no runtime environment variables — the API URL is baked into the nginx config as a proxy rule.

## Deploying to the Media VM

1. Push changes to `main` — GitHub Actions builds and pushes the image
2. On the media VM:
   ```bash
   docker compose pull
   docker compose up -d
   ```
3. The webapp is available at `http://<media-vm-ip>:8402`

## Updating

Pull the latest images and restart:
```bash
docker compose pull webapp journal
docker compose up -d
```

ChromaDB data and SQLite data persist in Docker volumes.
