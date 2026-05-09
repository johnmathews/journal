# Deployment

## Overview

The journal-webapp is a static SPA served by nginx. In production it runs as a Docker container alongside journal-server and ChromaDB on the media VM.

## Docker Image

Built by GitHub Actions on push to `main` and pushed to `ghcr.io/johnmathews/journal-webapp`.

The image uses a multi-stage build:
1. **Build stage** (Node 22 alpine): installs deps, runs `npm run build`
2. **Production stage** (nginx alpine): serves the built static files

No secrets are baked into the image. Auth is now cookie-based (sessions issued by `journal-server`), so the webapp container has no auth secret to inject. See `docs/auth.md`.

## nginx Configuration

The `nginx.conf` handles three concerns:

- **SPA routing**: All non-file routes serve `index.html` (Vue Router handles client-side routing)
- **API proxy**: `/api/*` requests are proxied to journal-server (`http://journal-server:8400`)
- **Static asset caching**: Files under `/assets/` get 1-year cache headers (Vite hashes filenames)

In production, nginx proxies API requests directly to the journal-server container. No CORS configuration is needed because the browser sees the same origin for both the webapp and the API.

During development, Vite's dev server proxy serves the same purpose (see `vite.config.ts`).

## docker-compose Stack

The `docker-compose.yml` defines the full stack for local or VM deployment:

| Service     | Image                                          | Port  | Purpose                    |
|-------------|------------------------------------------------|-------|----------------------------|
| `webapp`           | `ghcr.io/johnmathews/journal-webapp:latest`    | 8402  | Vue SPA (nginx)            |
| `journal-server`   | `ghcr.io/johnmathews/journal-server:latest`    | 8400  | Backend (MCP + REST API)   |
| `journal-chromadb` | `ghcr.io/johnmathews/journal-chromadb:latest`  | 8401  | Custom ChromaDB image (curl baked in for healthcheck) |

### Environment Variables

The journal-server container needs these environment variables (configured in docker-compose or on the host).
**Required:**

| Variable              | Description                                                                 |
|-----------------------|-----------------------------------------------------------------------------|
| `JOURNAL_SECRET_KEY`  | Server signing key for sessions and password-reset tokens. Server refuses to start without it. |
| `ANTHROPIC_API_KEY`   | For entity extraction, mood scoring, search reranking, and Anthropic OCR (when selected). |
| `OPENAI_API_KEY`      | For transcription (default) and embeddings.                                 |
| `GOOGLE_API_KEY`      | For Gemini OCR (the prod default) and/or Gemini transcription.              |

**Optional:**

| Variable              | Description                                                                 |
|-----------------------|-----------------------------------------------------------------------------|
| `DB_PATH`             | SQLite database path inside container.                                      |
| `CHROMADB_HOST`       | ChromaDB hostname (use `chromadb` in compose).                              |
| `CHROMADB_PORT`       | ChromaDB port (8000 internal).                                              |
| `OCR_PROVIDER`        | `gemini` (prod default) or `anthropic`.                                     |
| `OCR_DUAL_PASS`       | When `true`, both providers run on every page (prod runs `true`).           |
| `MCP_ALLOWED_HOSTS`   | Comma-separated list of Host header values the server will accept (DNS rebinding protection). Must include the public hostname the browser uses to hit the webapp, because nginx forwards the client's `Host` header unchanged. |
| `API_CORS_ORIGINS`    | Not needed in production (nginx proxies same-origin).                       |

See `../../server/docs/configuration.md` for the full env-var reference, including `REGISTRATION_ENABLED`, `SMTP_*`,
mood-scoring config, and runtime-toggleable settings.

The webapp container has **no required environment variables**. The API URL is baked into nginx as a proxy rule. Auth
is cookie-based (sessions), so there is no client-side bearer token to inject.

## Runtime token injection (legacy — no-op)

> **Status:** retired 2026-04-15 when multi-user auth shipped. The `docker/40-journal-config.sh` entrypoint hook and
> the `public/config.js` stub still exist as committed no-ops so old image layers do not fail on missing files. The
> only thing the script logs today is `40-journal-config: no-op (cookie-based auth, no token injection needed)`.

Historical context: the original deployment used a single `JOURNAL_API_TOKEN` bearer that was injected at container
startup into a `window.__JOURNAL_CONFIG__` global. That model was replaced by per-user sessions and per-user API keys.
The webapp now sends `credentials: 'include'` on every request and relies on the `session_id` cookie issued by
`POST /api/auth/login`.

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
docker compose pull webapp journal-server
docker compose up -d
```

ChromaDB data and SQLite data persist in Docker volumes.
