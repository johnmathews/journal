# 2026-04-11 — Mood scoring UI (Tier 1 item 3b webapp)

Session 5 of the Tier 1 plan, webapp half. Pairs with
`journal-server@fcd26d4` which shipped the mood scoring backend
earlier today. Closes work unit **T1.3b.vii** (frontend mood
chart) from `journal-server/docs/tier-1-plan.md`.

## What shipped

### 1. Types + API client

- **`src/types/dashboard.ts`** gains `MoodDimension`,
  `MoodDimensionsResponse`, `MoodTrendBin`, `MoodTrendsResponse`,
  `MoodTrendsParams`. All mirror the server contract byte-for-byte.
  `scale_type` is a `'bipolar' | 'unipolar'` union so TypeScript
  can narrow on it.
- **`src/api/dashboard.ts`** gains `fetchMoodDimensions()` and
  `fetchMoodTrends(params)`. Both throw `ApiRequestError` on 4xx/5xx
  — the store surfaces the message directly.

### 2. Pinia store

- **`src/stores/dashboard.ts`** gains a parallel mood surface
  alongside the existing writing-stats state. New state:
  - `moodDimensions: MoodDimension[]` — loaded once on first
    mount, cached for the session.
  - `moodBins: MoodTrendBin[]` — refetched on every range/bin
    change.
  - `hiddenMoodDimensions: Set<string>` — per-session facet
    visibility toggles. Default is "show everything". Not
    persisted to localStorage — if you want to hide joy_sadness
    permanently, edit the TOML file on the server instead.
  - `moodLoading`, `moodError`, `moodHasLoaded`.
  - `hasMoodData` (computed), `moodScoringEnabled` (computed).
- `loadMoodDimensions()` — swallows errors silently. Failure
  means mood dimensions stay `[]`, `moodScoringEnabled` is
  `false`, and the view renders the "mood scoring not
  configured" branch (actually just hides the card entirely).
  A loud error would be wrong here — mood scoring being off is
  a legitimate state, not an error.
- `loadMoodTrends(overrides)` — same shape as
  `loadWritingStats`. Surfaces `ApiRequestError.message`
  verbatim.
- `toggleMoodDimension(name)` — flips visibility. Creates a
  NEW Set instance rather than mutating the existing one so
  Vue's reactivity watcher fires. Mutating in place would be a
  footgun.
- `reset()` now also wipes the mood surface back to empty.

14 new store tests cover every new path (initial state, load
happy + error, API error surface, Set instance replacement,
reset, override merging).

### 3. DashboardView

- Three charts in the same `<div>`:
  1. Writing frequency (existing, top-left on xl+)
  2. Word count (existing, top-right on xl+)
  3. **Mood** (new, full-width below the two-column grid)
- Mood card shows:
  1. Title + explainer text mentioning the `[-1, +1]` and
     `[0, +1]` ranges so the chart makes sense at a glance.
  2. Dimension toggles — one pill per facet, with a coloured
     dot matching the line colour and a scale badge (`±1` for
     bipolar, `0..1` for unipolar). Clicking toggles
     visibility; a hidden facet shows `line-through`
     decoration on the label.
  3. Loading / error / empty / chart branches, same UX
     pattern as the writing-stats block.
- **Shared filter bar**: range and bin controls apply to all
  three charts. Range/bin click handlers fire
  `loadWritingStats` and `loadMoodTrends` in parallel via
  `Promise.all`, so a single click doesn't double the wait.
- **Fixed `[-1, +1]` y-axis** on the mood chart regardless
  of the bipolar/unipolar mix. Unipolar lines live in the top
  half and never dip below zero, which is visually
  informative: you can see "this unipolar facet sat near 0"
  distinct from "this bipolar facet went negative". Plotting
  unipolar on a separate 0..1 sub-axis would fragment the
  visual and hide correlations between facets, which is the
  whole point of having them in one chart.
- **Fixed colour palette** of 8 hex values cycled by dimension
  index. Reordering facets in the TOML file produces a stable
  colour assignment because the dashboard renders in the
  server's returned order, not the (arbitrary) response bin
  order.
- **Chart lifecycle**: destroyed and recreated on every data
  change + on every toggle flip. Same rationale as the
  existing writing/word charts — Chart.js handles fresh
  instances more predictably than in-place updates when axis
  shapes change.
- **Conditional rendering**: the mood chart card does not
  appear at all when `store.moodScoringEnabled` is false
  (empty dimensions response). No loud "mood scoring is off"
  banner — the absence of the card is the signal.

10 new view tests cover: card renders with dimensions, card
hidden when disabled, dimension toggles render with correct
scale badges, toggle click hides line and rerenders chart,
empty-state when mood_trends returns no bins, error banner on
fetch failure, range change triggers both reloads, bin change
triggers both reloads.

### 4. Playwright verification

Verified end-to-end using `browser_evaluate` to override
`window.fetch` with stub responses (the backend I'm running
locally is an older build without the new endpoints yet). At
three viewports:

1. **Desktop 1920×1080** — all three charts render, mood card
   shows 7 toggle pills with coloured dots and scale badges,
   mood lines overlap across the `[-1, +1]` axis as designed.
2. **Desktop 1920×1080 with joy_sadness toggled off** — the
   violet line disappears, pill shows line-through decoration,
   6 lines remain. Confirms chart teardown + rebuild on
   toggle.
3. **Phone 375×812 portrait** — sidebar behind hamburger,
   filter bar wraps cleanly (Range across 2 rows, Bin Width
   on 1), writing chart stacks full-width, word count below,
   mood card below that with toggles wrapping across 4 rows.
   Explanation text wraps readably. 6 lines still render
   across the compact y-axis. Date labels readable.

Screenshots in `.playwright-mcp/mood-dashboard-*.png`.

## Deliberate non-goals for this session

1. **Dark-mode chart theming.** Same rationale as 3a — the
   charts use `colors.*.light` explicitly. Dark-mode is a
   low-effort follow-up once someone asks.
2. **Dimension visibility persistence.** Toggles are
   per-session. Persisting to localStorage is a trivial
   addition but not in 3b scope — if you want a facet
   permanently hidden, edit the TOML file on the server.
3. **A webapp surface for editing facets.** Out of scope —
   facets live in a server-side config file the operator
   edits directly.
4. **Cross-facet correlation visualisation** (scatter
   plots, correlation heatmap). Tier 3 follow-up after
   ~60-100 real entries. The capture pipeline ships first.
5. **Chart zoom / pan.** Chart.js has a first-party zoom
   plugin; not needed for the current dataset sizes.

## Tests and quality gates

- **Before:** 261 tests across 26 files.
- **After:** 285 tests across 26 files. +24 new tests:
  1. `src/api/__tests__/dashboard.test.ts` — 5 new (mood
     dimensions + trends: fetch URL construction, response
     passthrough, null param handling).
  2. `src/stores/__tests__/dashboard.test.ts` — 14 new
     (mood state initial / happy path / errors / toggles /
     reset / overrides).
  3. `src/views/__tests__/DashboardView.test.ts` — 7 new
     (card rendering, toggles, empty state, error banner,
     range+bin change firing both loads).
  4. Existing DashboardView tests got mood stubs added to
     their shared `vi.mock('@/api/dashboard', ...)` so the
     new onMounted path doesn't break them.
- **`npm run lint`:** clean.
- **`npm run build`:** passes. `DashboardView` is now a
  183.23 kB lazy chunk (63.08 kB gzipped) — +5 KB vs
  session 4 for the mood chart logic.

## Follow-ups

1. **Redeploy the running backend** so the new
   `/api/dashboard/mood-dimensions` and
   `/api/dashboard/mood-trends` endpoints are reachable. Set
   `JOURNAL_ENABLE_MOOD_SCORING=true` in env + provide an
   `ANTHROPIC_API_KEY`, then run
   `journal backfill-mood --stale-only --dry-run` to see the
   cost before paying. Once the endpoints are live, the mood
   chart card will replace the "empty state" branch
   automatically on the next page load.
2. **Ingest a few entries with scoring on** to get real mood
   data flowing. The dashboard is designed around the
   "morning pages" cadence (one entry per day). After ~2
   weeks there'll be enough data to start noticing
   day-of-week patterns.
3. **Tier 3 correlation analysis** — noted in
   `journal-server/docs/mood-scoring.md`. Revisit after
   ~60-100 scored entries.
