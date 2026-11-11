# 2026-07-13 — Stale-chunk recovery: router.onError hard reload

## Symptom

On iPhone (and once on desktop Firefox), links — most visibly the
Storylines sidebar item — silently did nothing until a page refresh.

## Root cause

Every route is lazy-loaded and builds fingerprint their chunks. A tab
opened before a deploy keeps the old chunk map; after the deploy the old
files are gone from the container, so navigating to a not-yet-visited
route 404s on the dynamic import (`GET /assets/StorylineListView-*.js →
404` in the prod access log, 06:09 this morning from iOS Safari) and Vue
Router aborts the navigation with an unhandled error. Not introduced by
the storylines redesign — exposed by its three same-day deploys. The
earlier nginx `index.html` no-cache fix (bf18835) covered fresh loads,
not already-open tabs.

## Fix

`src/router/chunkReload.ts` + wiring in `src/router/index.ts`:
`router.onError` detects chunk-load failures and hard-navigates to the
target path (`window.location.assign`), which fetches the fresh
`index.html` and chunk map. A per-path `sessionStorage` flag prevents a
reload loop when the failure is persistent (genuinely offline), and
`router.afterEach` clears the flag so the *next* deploy can recover
again. Helper is dependency-injected (storage + reload) for unit tests.
