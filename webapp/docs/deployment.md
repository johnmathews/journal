# Deployment

## Overview

The journal-webapp is a static SPA served by nginx. In production it runs as a Docker container alongside journal-server and ChromaDB on the media VM.

## Docker Image

Built by GitHub Actions on push to `main` and pushed to `ghcr.io/johnmathews/journal-webapp`.

The image uses a multi-stage build:
1. **Build stage** (Node 22 alpine): installs deps, runs `npm run build`
2. **Production stage** (nginx alpine): serves the built static files

No secrets are baked into the image. The bearer token used to authenticate against `journal-server` is injected at container startup — see [Runtime token injection](#runtime-token-injection) below.

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

| Variable              | Description                                        |
|-----------------------|----------------------------------------------------|
| `DB_PATH`             | SQLite database path inside container              |
| `CHROMADB_HOST`       | ChromaDB hostname (use `chromadb` in compose)      |
| `CHROMADB_PORT`       | ChromaDB port (8000 internal)                      |
| `ANTHROPIC_API_KEY`   | For OCR (Claude vision)                            |
| `OPENAI_API_KEY`      | For transcription + embeddings                     |
| `JOURNAL_API_TOKEN`   | Bearer token required on every `/api/*` and `/mcp` request. Server refuses to start without it. The **same value** must also be passed to the `journal-webapp` container (see [Runtime token injection](#runtime-token-injection)). |
| `MCP_ALLOWED_HOSTS`   | Comma-separated list of Host header values the server will accept (DNS rebinding protection). Must include the public hostname the browser uses to hit the webapp, because nginx forwards the client's `Host` header unchanged. |
| `API_CORS_ORIGINS`    | Not needed in production (nginx proxies same-origin) |

The webapp container requires **one** runtime environment variable: `JOURNAL_API_TOKEN`, matching the value set on `journal-server`. See [Runtime token injection](#runtime-token-injection). The API *URL* is baked into the nginx config as a proxy rule and is not configurable at runtime.

## Runtime token injection

`journal-server` rejects every request to `/api/*` and `/mcp` without a valid `Authorization: Bearer <token>` header. The webapp obtains that token at **container startup**, not at image build time, so:

- The `ghcr.io/johnmathews/journal-webapp` image contains no secrets and can be pulled by anyone with access to the registry without leaking the live token.
- Rotating the token is a `docker compose up -d`, not a CI rebuild.
- Dev and prod read the token from different places with the same client code.

### How it works

1. `public/config.js` is a committed stub containing `window.__JOURNAL_CONFIG__ = {}`. Vite copies it into `dist/` at build time, and `index.html` loads it via a synchronous `<script>` tag **before** the app bundle.
2. `docker/40-journal-config.sh` is dropped into `/docker-entrypoint.d/` in the final image. The `nginx:alpine` base image's own entrypoint executes every `*.sh` file in that directory before starting nginx, so no custom `ENTRYPOINT` is needed.
3. On container start the script reads `JOURNAL_API_TOKEN` from the environment, validates that it matches `[A-Za-z0-9_-]+` (the URL-safe base64 alphabet produced by `secrets.token_urlsafe`), and rewrites `/usr/share/nginx/html/config.js` with `window.__JOURNAL_CONFIG__ = { apiToken: "<token>" }`. If the env var is missing or malformed the container exits non-zero, mirroring the server's fail-closed behaviour.
4. `nginx.conf` serves `/config.js` with `Cache-Control: no-store` (exact-match `location = /config.js`), so a rotated token takes effect on the very next request.
5. `src/api/client.ts` reads `window.__JOURNAL_CONFIG__?.apiToken` first and falls back to `import.meta.env.VITE_JOURNAL_API_TOKEN`. The fallback is used by `npm run dev` (via `.env.local`) and by unit tests (via `vi.stubEnv`); in production it's empty, so a deployment where the entrypoint never ran will loudly return 401s rather than silently using a stale baked value.

### Threat model

The token authenticates the **client application**, not the end user. Anyone who successfully loads the webapp in a browser can read the token out of `/config.js` (or out of `window.__JOURNAL_CONFIG__` in devtools). The webapp is therefore expected to sit behind a reverse proxy with its own authentication — the bearer token is the second layer, not the first.

What runtime injection specifically buys over a build-time bake:

- The token is never stored in a container image layer on `ghcr.io`.
- Anyone with read access to the image does **not** automatically have the live token.
- Rotation is decoupled from the CI pipeline.

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
