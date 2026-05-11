# Chart style guide

**Status:** active. **Last updated:** 2026-05-11.

All charts in the webapp share a small set of conventions so the dashboard, the
fitness page, and any new chart added later all hover, click, and read the same
way. This guide documents the conventions and the helpers that enforce them.

Source of truth: [`src/utils/chartjs-config.ts`](../src/utils/chartjs-config.ts).
Don't re-derive any of this in a view — import the helper and pass per-chart
overrides.

## Core decisions

1. **Tooltip mode is `index`, intersect is `false`.** Hover resolves to "every
   series at this x" rather than the nearest single point. The vertical-crosshair
   feel is what readers expect after the dashboard's entity-trends and mood
   charts; the fitness charts (F6, 2026-05-11) were ported onto the same pairing.
2. **Tooltip styling reads from `getChartColors()`.** Background, title, body,
   and border are all driven from CSS variables so light/dark themes hand-off
   cleanly. Never hard-code tooltip colors.
3. **Grid color via `getThemedGridColor()`.** Reads `<html class="dark">` at
   call time so a theme toggle after the chart renders picks up the right value.
4. **`tooltipHoverDelayPlugin`** is registered globally in `chartjs-config.ts` —
   you don't add it per chart. It enforces a 1 s dwell before the tooltip shows,
   which keeps dense charts from feeling jumpy.

## Helpers

### `buildLineChartOptions({ colors, ... })`

Returns the canonical line-chart options block: `responsive`,
`maintainAspectRatio`, `interaction`, `plugins.legend`, `plugins.tooltip`,
`scales.x`, `scales.y`. Use it for any new line chart.

Args:

- `colors` — pass `getChartColors()`.
- `showLegend?: boolean` — default `false`. Most line charts in this app use
  external chip toggles for series; the built-in legend is the wrong size and
  position for that pattern. Set `true` for charts with no external toggle
  surface.
- `beginAtZero?: boolean` — default `true`. Pass `false` for metrics where
  the interesting range floats above zero (resting HR, HRV, sleep score
  starts at ~60).
- `yTickPrecision?: number` — default `0` (integer ticks). Bump for decimal
  metrics.

### `getChartColors()`

Returns the eight-color palette every chart should consume. Each color is
returned as `{ light, dark }`; most call sites use `.light` and rely on
Chart.js for theme handoff at draw time.

### `getThemedGridColor()`

Returns the appropriate grid-line color for the active theme. Call at render
time, not at module load — a theme toggle between mounts should pick up the
right value.

### `chartAreaGradient(ctx, chartArea, stops)`

Builds a vertical canvas gradient between the chart's top and bottom. Used
for filled line charts that want a fade from solid (top) to transparent
(bottom).

## Patterns

### Bold MA over faded daily

Sleep, HRV, and resting heart rate are noisy day-to-day but trend cleanly when
smoothed. The convention (F7) is two datasets per chart:

1. **3-day centred moving average** — bold (`borderWidth: 2.5`), filled with
   the chart's primary color at ~0.18 opacity, `pointRadius: 0` so it reads as
   a line not a scatter, `order: 1` so it draws on top.
2. **Daily series** — thin (`borderWidth: 1`), no fill, color at ~0.35 opacity,
   `pointRadius: 2`, `order: 2` so it sits underneath.

Compute the MA with [`movingAverage3()`](../src/utils/moving-average.ts) — it
truncates the window at series edges so the smoothed line spans the full date
range, and skips nulls inside the window so single missing days don't blow a
hole in the smoothing.

### When NOT to use `buildLineChartOptions`

- **Bar charts** — pass inline options. The stacked-bar chart on /fitness
  reuses the same `interaction.mode='index'` + `tooltip.filter`/`itemSort`
  pattern, but the rest of the options shape (scales `stacked: true`, no
  `autoSkip` x-axis) doesn't match.
- **Charts with click-to-drill-down** — the dashboard mood chart's
  `options.onClick` needs to live close to the dataset definitions. Don't
  shoehorn it through the builder.
- **Dual-axis charts** — `scales.y1` / `scales.y2` aren't part of the builder
  signature.

## Adding a new line chart

```ts
import { Chart } from 'chart.js'
import {
  getChartColors,
  buildLineChartOptions,
} from '@/utils/chartjs-config'

const colors = getChartColors()
new Chart(canvas, {
  type: 'line',
  data: { labels, datasets: [{ label, data, borderColor: ..., ... }] },
  options: buildLineChartOptions({ colors, beginAtZero: false }),
})
```

That's the whole recipe. No inline `plugins`, `scales`, or `interaction` —
the builder owns those. Per-chart needs (datasets, the chart `title` if any,
y-axis min/max) stay at the call site.

## Discoverability

This guide is linked from [`docs/architecture.md`](./architecture.md) under
the Charts section and from the project's `CLAUDE.md` Tech Stack section so a
new contributor lands here when adding charts.
