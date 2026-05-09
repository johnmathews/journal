# 2026-05-09 — Dashboard mood chart UX tweaks

Three small UX changes to the Mood Trends card on the dashboard, applied across
every Chart.js chart on the dashboard for consistency rather than one-off
patches on the mood chart alone.

## What changed

1. **Removed the "All" pill** at the top right of the mood-dimension toggles.
   It was the only single-click way to re-enable every hidden dimension, but
   the per-group buttons already cover the same ground in two clicks, and the
   tiny pill was visually cluttered. The store method
   `showAllMoodDimensions()` stays — tests and any future programmatic caller
   can still use it; only the UI affordance is gone.
2. **1-second hover-intent delay before tooltips render.** The instant-on
   tooltip was getting in the way of scanning the chart. Now applies to every
   Chart.js chart on the dashboard.
3. **Darkened light-mode grid lines** so absolute values are readable on the
   right-hand side of the chart, far from the y-axis labels. Dark mode keeps
   its existing (already-clear) appearance.

## Hover-delay implementation: the false start

First attempt: a Chart.js plugin's `afterEvent` hook that mutated
`tooltip.opacity = 0` while a dwell timer was pending. In unit tests it looked
correct; in the browser the tooltip flashed in immediately anyway. Cause:
Chart.js's tooltip plugin animates `opacity` via the same animator that drives
chart transitions, so the next animation frame overwrites whatever we set in
`afterEvent`. Direct property mutation is a dead end for this property.

The fix: use the supported `tooltip.setActiveElements([], {x: 0, y: 0})` API
to keep the tooltip in the "no active element" state during the dwell window,
and stash the real active elements + position on the chart's per-instance
state. When the dwell timer fires, we restore them with
`setActiveElements(saved, savedPos)` and call `chart.update('none')`. Chart.js
then renders the tooltip via its own state machinery; opacity isn't ours to
fight with.

Per-chart state lives in a module-level `WeakMap<ChartInstance, ...>` so it's
collected automatically when a chart is destroyed. The plugin also implements
`beforeDestroy` to clear any pending timer for paranoia, and the timer
callback wraps `setActiveElements + update` in a `try/catch` so a chart
destroyed mid-delay doesn't surface an error.

## Grid-color helper

Existing chart code used `colors.gridColor.light` (= `--color-gray-100`) in
both themes. On dark gray-800 backgrounds that's high contrast and looks
great; on white it's almost invisible. Added `getThemedGridColor()` to
`chartjs-config.ts` which reads `<html class="dark">` at call time and
returns gray-100 for dark theme or gray-300 for light theme. Replaced all
five dashboard chart usages of `colors.gridColor.light` with the helper.

The chart code only re-renders on data changes, not on theme toggles — so a
user switching themes mid-session won't see grid colors update until the
next data refresh. Not addressing that here; the user's complaint was
absolute visibility in light mode, not live theme switching, and adding a
theme watcher to every chart's render trigger is scope creep.

## Verification

Spun up the local stack (ChromaDB + journal-server + webapp dev), seeded
sample entries via `journal seed`, reassigned them to the dev user, and
inserted synthetic mood scores directly into SQLite (the seeded entries
have no scores by default and the local `ANTHROPIC_API_KEY` is a
placeholder, so `journal backfill-mood` wasn't an option). Drove the
browser via Playwright and verified end-to-end:

- Tooltip stays hidden at +100ms and +700ms after hover
- Tooltip appears at +1300ms after a stationary 1s dwell
- Moving to a different point during the dwell resets the timer
- Light-mode grid lines clearly visible at -1.0, -0.5, 0, 0.5, 1.0
- Dark mode appearance unchanged from before
- "All" pill is gone

## Tests

Added 17 new unit tests for the chartjs-config module covering:

1. `getThemedGridColor()` — returns gray-100 with `dark` class, gray-300 without.
2. `tooltipHoverDelayPlugin` — fresh hover hides tooltip + reveals after dwell;
   `mouseout` cancels the timer; moving to a new point restarts the timer; same
   point doesn't restart; `beforeDestroy` clears pending timers; chart with no
   tooltip is a no-op; `setActiveElements` errors mid-delay are swallowed.
3. The constant `TOOLTIP_HOVER_DELAY_MS = 1000` is exported and consumed.

Removed two obsolete `DashboardView.test.ts` cases that depended on the
deleted "All" button DOM (`"All" button clears the selection and shows
every dimension`, `"All" is disabled when selection is empty…`). Replaced
with a single regression test confirming the button no longer exists.
Updated one test that used the show-all button to clear selection — now
calls the store method directly (`store.showAllMoodDimensions()`).

Coverage after changes: 91.26% statements / 85.09% branches / 88.32%
functions / 93.40% lines (above the 85% gates).
