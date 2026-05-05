# Admin → Server: clarify what mood-dimensions reload affects

User asked, while looking at the Admin → Moods tab, what happens when
`mood-dimensions.toml` is edited on disk. Confirmed the flow:

1. Server reads the TOML once at startup into
   `services["mood_dimensions"]` / `services["mood_dimensions_meta"]`. No
   file watcher.
2. The Admin → Server tab's "Mood dimensions" reload button hits
   `POST /api/admin/reload/mood-dimensions`, which atomically swaps in the
   new dimensions and rebuilds `MoodScoringService` for both ingestion and
   the job runner.
3. `GET /api/dashboard/mood-dimensions` then returns the fresh data, but
   the Pinia dashboard store caches the response for the session (see
   `loadMoodDimensions` in `stores/dashboard.ts`), so the Admin → Moods
   tab keeps showing the stale list until the page is reloaded.

The Admin → Server tab's description for the mood-dimensions reload only
mentioned the scoring service. It now also calls out the Moods tab and
the page-reload step needed to defeat the session cache. Added a
`<RouterLink>` to `/admin/moods` so operators can jump there directly.

Cosmetic copy/markup change — no logic affected. Existing
`AdminServerView.test.ts` (9 tests) still passes; lint clean.
