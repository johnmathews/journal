# Dashboard charts: fill empty bins so x-axes show real gaps (W22)

**Date:** 2026-06-10
**Branch:** `eng-w22-fill-bins`

## Problem

The server's dashboard endpoints (`/api/dashboard/writing-stats`,
`mood-trends`, `entity-trends`) build their bins with a SQL `GROUP BY`,
so only non-empty periods come back. The dashboard view mapped those
bins straight onto Chart.js category labels, which means a two-month
writing gap rendered as two adjacent x-axis points — visually identical
to continuous weekly writing ("1 entry/week" flat line over a gap).

The fitness chart already did this correctly: `FitnessView.vue::
bucketByWeek` emits one bucket per ISO week (Monday-aligned) over the
whole window, including empty ones. W22 brings the dashboard charts in
line with that pattern, client-side, with no server change.

## Change

- New `src/utils/bins.ts`:
  - `fillPeriods(periods, from, to, bin)` — expands a sparse list of
    period-start strings into a contiguous sorted grid over `[from, to]`
    for `week` (Monday-aligned, same as `bucketByWeek` and the server's
    `bin_start`), `month`, `quarter`, and `year`. `from === null`
    (range `'all'`) anchors at the earliest input period; `to === null`
    defaults to today (UTC). Input periods are never dropped — the grid
    widens to cover out-of-window periods and unions in off-grid ones.
  - `fillBins(bins, from, to, bin)` — same grid, materialised as
    zero-count `WritingFrequencyBin`s.
- `DashboardView.vue`:
  - **Writing-frequency + word-count** charts now plot `filledBins`
    (zero entries / zero words in empty periods).
  - **Mood-trends**: `pivotMoodBins` builds its period axis with
    `fillPeriods`; empty periods pivot to `null` and the datasets'
    existing `spanGaps: false` breaks the lines there — a visible gap,
    not a fabricated 0 score (a 0 would be a meaningful "neutral" on
    bipolar scales, so zero-filling would lie).
  - **Entity-trends** (stacked bar): contiguous axis via `fillPeriods`;
    missing periods already render as 0-height bars via the existing
    `?? 0` pivot.

Charts *not* touched, and why:
- **Calendar heatmap** — builds its own contiguous day grid already.
- **Entity distribution doughnut, mood-entity correlation, word-count
  distribution histogram** — not time-binned; no period axis to fill.

## Tests

- `src/utils/__tests__/bins.test.ts` — 24 cases: Monday alignment,
  month/quarter/year grids, range-edge padding, `'all'` anchoring,
  today-default (pinned clock), off-grid union, empty input, input
  immutability.
- `DashboardView.test.ts` — new "empty-bin filling (W22)" describe with
  the clock pinned (`vi.useFakeTimers({ toFake: ['Date'] })`, since the
  default range and the `to` endpoint derive from today): sparse weekly
  fixtures must produce a contiguous 14-Monday label axis with
  zero-filled series, for the writing/word charts and entity trends.
