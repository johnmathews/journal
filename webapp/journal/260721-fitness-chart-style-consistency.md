# 260721 — Fitness acute-load chart: style + spline consistency with the dashboard

## Trigger

Reviewed whether the /fitness "Training load vs. how I feel" chart (dual-axis;
left axis = `training_load_acute`) matches the homepage dashboard line charts.
Spline (`tension: 0.35`) already matched. Styling was close but had drifted, and
side-by-side the two charts "looked different."

## What differed

- **X-axis tick thinning** — the dual-axis chart inlines its options (it's the
  documented `buildLineChartOptions` exemption) but had dropped the builder's
  `autoSkip: true` / `maxTicksLimit: 8`.
- **Y-axis precision** — left axis lacked the builder's `precision: 0`.
- **Date label format** — dashboard rendered raw ISO `2026-04-20` (`bin_start`);
  fitness rendered `21 Apr` via an inline `toLocaleDateString`. Genuinely
  inconsistent, and the fitness path parsed in local time (off-by-one risk west
  of UTC).

The dominant "looks different" driver — dashboard is smooth (~13 weekly points),
fitness is a spiky scribble (~90 raw daily points × 3 series) — is **inherent to
the data**. Per the user's call we **kept raw daily** (no moving average / weekly
binning); the day-level detail is wanted and the divergence callouts below the
chart lean on daily data.

## Changes

- `MoodFitnessChart.vue`: added `autoSkip`/`maxTicksLimit: 8` to x-ticks and
  `precision: 0` to the left y-axis (mirroring the builder). `y1` freshness (0–1)
  intentionally keeps decimal ticks.
- New `src/utils/binLabel.ts` — `formatBinLabel(iso, bin)` — one UTC-deterministic
  formatter (`21 Apr` / `Apr 2026` / `Q2 2026` / `2026`). Now the single source of
  truth for x-labels in `WordCountChart`, `WritingFrequencyChart`, and
  `MoodFitnessChart`, so the dashboard adopted the readable format too (user's
  choice: "21 Apr everywhere"). A blind day+month format would have rendered
  every yearly bin as "1 Jan" — hence the bin-aware granularity.
- Tests: new `binLabel.spec.ts`; dashboard specs + `DashboardView.test.ts` now
  assert labels *through* `formatBinLabel` (locale-agnostic — en-GB "5 Jan" vs
  en-US "Jan 5").
- `docs/chart-style-guide.md`: documented `formatBinLabel` and the dual-axis
  mirror requirement.

## Verification

`npm run test:coverage` → 1983 passed, coverage above the 85% gates; `npm run
build` type-checks clean; lint clean.
