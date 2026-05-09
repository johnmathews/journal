# 260509 — docs archive + accuracy audit

Webapp-side counterpart to the server-repo docs cleanup. Driven by the user's request to make
the active `docs/` listing easier to scan and to verify the surviving docs are still accurate.

## Archive

Moved `docs/future-features.md` (already self-declared "retired 2026-05-09. Superseded by
`server/docs/roadmap.md`") into `docs/archive/future-features.md`. Added `docs/archive/README.md`
explaining the archive is not load-bearing and pointing at the canonical roadmap.

## Audit (parallel reviewer subagent against `src/` + cross-checked against the server repo)

Material findings fixed:

- **`architecture.md`** — removed claim that `src/stores/insights.ts` exists (verified absent;
  rephrased the `/insights` retired section accordingly). Added missing views (`AdminMoodsView`,
  `CreateEntryView`, `EntityListView`, `EntityDetailView`), missing composable (`useWakeLock`),
  missing utilities (`cost-estimates.ts`, `dateRange.ts`, `mood-display.ts`, `mood-groups.ts`),
  and missing stores (`notifications`, `settings`, `auth`). Updated routing paragraph to note
  `/insights` redirects to `/` and mention `/jobs`.
- **`auth.md`** — added `updateDisplayName()` to actions list; documented the `/api/auth/*`
  401-exemption pattern (`setUnauthorizedHandler` registration in `client.ts` + `main.ts`);
  updated route-guard list to include the actual `/verify-email` exemption (signed-in-but-
  unverified users keep access) and the admin-route redirect target (dashboard); added
  `/admin/moods` row to Admin Routes table.
- **`deployment.md`** — fixed nginx upstream hostname `http://journal:8400` →
  `http://journal-server:8400` (matches `nginx.conf` and the actual compose service name).
  Renamed compose service rows: `journal` → `journal-server`, `chromadb` → `journal-chromadb`
  (matches `docker-compose.yml` and prod ground-truth container names). Updated
  `docker compose pull webapp journal` → `... webapp journal-server`.
- **`development.md`** — fixed broken `cd journal-server` / `cd journal-webapp` chains in the
  full-stack quickstart (now `cd ../journal-server` / `cd ../journal-webapp`); refreshed the
  Project Structure tree comments (composables, stores, views); added `npm run format:check`
  row to the Commands table; rewrote the pre-push description to match `.husky/pre-push`
  exactly (format:check + lint + test:coverage + build).

## Guidance

Added a "Documentation lifecycle" section to `webapp/CLAUDE.md`: prefer shorter docs but no
hard cap; when a doc is closed or superseded, add a status header, `git mv` to `docs/archive/`
in the same commit, update inbound links. Same rule was added to `server/CLAUDE.md` and
`journal/CLAUDE.md`, plus the global `~/.claude/CLAUDE.md` and the `engineering-team` /
`/done` skills.
