# 2026-06-10 — Deployment config fixes (W10): compose port/keys/volume, Vite proxy anchor

Work unit W10 of the engineering-team run `manual-20260610T160013Z`. The self-contained
`docker-compose.yml` stack in this repo was dead on arrival, and the Vite dev proxy
swallowed SPA routes that start with `/api`. All fixes verified locally.

## What was broken

1. **Server bound the wrong port.** `journal-server` defaults `MCP_PORT` to 8000
   (`server/src/journal/config.py`), and the compose file set no `MCP_PORT` while
   mapping `8400:8400` and nginx proxying to `journal-server:8400`. Nothing listened
   on 8400 inside the container, so every `/api` request 502'd.
2. **Provider API keys never reached the container.** `docs/deployment.md` lists
   `ANTHROPIC_API_KEY`/`OPENAI_API_KEY`/`GOOGLE_API_KEY` as required, but the compose
   file didn't pass them through.
3. **Chroma volume mounted the wrong path.** The image persists to `/data` (its
   `/config.yaml` `PERSIST_DIRECTORY`), not the legacy `/chroma/chroma` the volume
   targeted — embeddings were silently unpersisted.
4. **Inconsistent restart policies** (webapp `unless-stopped`, the other two none).
5. **Vite proxy key `'/api'`** is a path _prefix_, so hard-loading SPA routes like
   `/api-keys` got proxied to the backend and returned its raw 404 instead of
   `index.html`.

## Fixes

- `docker-compose.yml`: `MCP_PORT=8400` on journal-server; the three API keys passed
  via `${VAR:-}` interpolation (`JOURNAL_SECRET_KEY` keeps its `:?` fail-fast);
  Chroma volume target → `/data`; `restart: unless-stopped` on all three services.
- `vite.config.ts`: proxy key `'/api'` → `'^/api/'` (anchored regex). Prod nginx is
  unaffected — its `location /api/` already has the trailing slash.
- `.env.example`: removed the retired `VITE_JOURNAL_API_TOKEN` block (runtime token
  injection retired 2026-04-15; `docker/40-journal-config.sh` stays as a documented
  no-op); documented `JOURNAL_SECRET_KEY` + the three API keys as compose-level vars.
- `docs/deployment.md`: env table now notes compose interpolates from `.env`, adds an
  `MCP_PORT` row, fixes the `CHROMADB_HOST` service name (`journal-chromadb`).
- `README.md`: dropped the stale "set `VITE_JOURNAL_API_TOKEN`" instruction.

## Verification

- `docker compose --env-file <tmp> config` resolves cleanly with dummy values:
  `MCP_PORT: "8400"`, all three keys present, chroma target `/data`,
  `restart: unless-stopped` on all services.
- Without `JOURNAL_SECRET_KEY`, `docker compose config` exits 1 with the fail-fast
  message — the `:?` guard is intact.
- Dev server smoke: `curl http://localhost:<vite-port>/api-keys` returns the SPA
  `index.html`; `/api/health` still proxies to the backend.
- `npm run build` green.

Note: existing deployments of this compose file have an old `chromadb-data` volume
with data under `/chroma/chroma`; since that path was never the image's persist dir,
there is nothing of value to migrate.
