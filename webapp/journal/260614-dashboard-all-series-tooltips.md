# Dashboard tooltips show all series at the hovered date

**Date:** 2026-06-14

## What

Hovering a dashboard chart now surfaces **every series at that x-position** instead of
only the nearest single point. The Mood Trends chart was the visible offender — hovering a
date showed one mood dimension, not all of them.

## Why it was broken

`chartjs-config.ts` set the global default `Chart.defaults.plugins.tooltip.mode = 'nearest'`.
The line charts set `interaction.mode = 'index'`, but that only governs hover *hit-testing* —
the tooltip plugin keeps its own `mode`, which stayed `'nearest'`, so tooltip *contents*
were single-series. Notably this contradicted our own
[`docs/chart-style-guide.md`](../docs/chart-style-guide.md), whose rule #1 already states
"Tooltip mode is `index`… every series at this x." The code simply never matched the
documented convention.

## The fix

One line: flip the global default to `'index'` (keeping `intersect: false`). Every chart's
tooltip now lists all series at the hovered x. Verified safe across all dashboard chart
types — single-dataset charts (doughnut distribution, correlation bars) are unaffected
because `'index'` and `'nearest'` coincide when there's one item per x; the multi-series
time charts (Mood Trends, Writing Frequency, Word Count, stacked Topic/Entity Trends) gain
the all-series tooltip.

## Tests

Updated the `chartjs-config` default assertion to `'index'`; added a Mood Trends guard
asserting it inherits the all-series default (doesn't pin `'nearest'`); corrected two now-stale
`'nearest'` references in test fixtures/comments. Coverage held ≥85%.

Confidence on behavior comes from the unit assertions on the resolved chart config plus
Chart.js's documented `tooltip.mode: 'index'` + `intersect: false` semantics; I did not spin
up the full local stack just to hover a tooltip.
