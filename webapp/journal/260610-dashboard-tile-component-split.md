# Dashboard tile component split (W23)

**Date:** 2026-06-10

## What

Extracted the seven dashboard tile bodies out of `DashboardView.vue` (2,024
lines) into `src/components/dashboard/` — one component per tile:

- `WritingFrequencyChart.vue`, `WordCountChart.vue` — line charts, now on
  `buildLineChartOptions` per `docs/chart-style-guide.md`
- `MoodTrendsChart.vue` — keeps inline options (click-to-drill-down `onClick`
  is a documented builder exemption); owns the drill-down panel too
- `EntityDistributionChart.vue` — doughnut (line-charts-only exemption)
- `EntityTrendsChart.vue` — stacked bar (bar-chart exemption)
- `MoodCorrelationChart.vue` — horizontal bar (bar-chart exemption)
- `CalendarHeatmap.vue` — pure CSS grid, no Chart.js
- `shared.ts` — line/doughnut palettes, `entityTypeLabel`, `filledWritingBins`

Each chart component owns its canvas ref + `Chart` instance, re-renders via
`watch(..., { flush: 'post' })` (the full rationale comment lives in
`MoodTrendsChart.vue`; the others reference it), and destroys the instance in
`onUnmounted` — previously chart instances leaked across unmounts because
teardown was tied to the view's ad-hoc re-render switch rather than component
lifecycle. Tile visibility switching is now plain `v-if` mount/unmount through
`TileGrid` slots.

`DashboardView.vue` is down to 402 lines: store loads, range/bin handlers,
the heatmap date-window computation (kept in the view because it derives from
the measured tile width via the `TileGrid` ref), and prop/event wiring.

## Test split

Per-chart `describe` blocks moved from `DashboardView.test.ts` (1,964 →
1,230 lines) into `src/components/dashboard/__tests__/*.spec.ts`. The specs
mount each component through a small harness that mirrors the view's
prop/event wiring against the real Pinia store, so every moved assertion is
unchanged — only the mounting changed. Shared Chart.js constructor/destroy
spies and the chartjs-config color stubs live in
`__tests__/chart-test-utils.ts` (vi.mock factories dynamically import it, so
factory and spec share the same spy instances).

The view test keeps wiring/loading/error/empty/tile-layout coverage plus both
pinned-clock blocks (calendar heatmap window, W22 empty-bin filling — those
exercise view-level date logic end to end). New component-level tests were
added for destroy-on-unmount and bins-prop re-render.

## Notes

- No behavior change intended or observed; all pre-existing assertions and
  `data-testid`s preserved.
- `docs/architecture.md`'s DashboardView paragraph still describes the
  three-chart era — that's W26's docs-accuracy sweep, not this unit.
