# Fitness tile-layout plan — T2 + T3 + T4 shipped

Date: 2026-05-11 (late, second pass). Plan:
[`server/docs/fitness-tile-layout-plan.md`](../../server/docs/fitness-tile-layout-plan.md).
Prior wrap-up: [`260511-fitness-tile-layout-t7.md`](./260511-fitness-tile-layout-t7.md).

## What landed

Three webapp commits, in order, all squarely on the plan:

- **T2** — extracted a generic `TileGrid.vue` from `DashboardView.vue`.
  The dashboard adopts the new component first to prove the extraction
  is faithful (zero visible diff, all 59 existing dashboard
  tile-editing tests pass unchanged).
- **T3** — `/fitness` adopts the same component. New `FITNESS_TILES`
  constant + fitness store layout state (`tileOrder`, `hiddenTiles`,
  `tileWidths`, `editingLayout`) mirror the dashboard's surface.
  Default widths per D5: weekly-distinct + recent-workouts = `full`,
  sleep / hrv / rhr = `third` (three thirds in a row matches today's
  layout — byte-equivalent default).
- **T4** — `fitness_layout` round-trips to `/api/users/me/preferences`.
  Mutations debounce to a single PUT 500ms after the last edit;
  `loadLayout` runs on FitnessView mount to restore order/widths/
  hidden set.

T5 (drag-and-drop checkpoint) is *not* satisfied by T2+T3 alone — the
dashboard never had native HTML5 drag-drop; it ships up/down arrow
buttons in edit mode. The same model is now on `/fitness`. If the
"drag" interaction is a hard requirement, that's a new unit
(`onDragStart` / `onDragOver` / `onDrop` plumbing on `TileGrid`); it
hasn't been opened because nothing in the user feedback specifically
asked for native drag over the existing arrow controls.

## Design notes

**Per-tile `testId` on `TileDef` was the right hook.** Existing
dashboard tests select sections like
`[data-testid="dashboard-writing-chart-card"]` to assert visibility,
then drill down with `.find('button[title="Hide chart"]')`. Stamping
the testid on `TileGrid`'s `<section>` (via a field on each tile def)
kept those selectors working without per-test rewrites. This is the
fourth time the "consumer-owned testid prefix" pattern from
`RangeBinControls` has paid off — F5 chip controls, F5/F6 chart
adoption, F6 builder adoption, and now T2.

**Named widths vs numeric spans — kept both representations.** The
dashboard's `DashboardLayout.tileWidths` stays numeric (`1 | 2`) to
preserve backward compat with persisted user data and the tests that
pin that shape. `/fitness` uses `NamedWidth = 'third' | 'half' | 'full'`
because it has three width choices on a 6-column grid. `TileGrid`
itself is oblivious: each consumer provides a `getSpan(id) => string`
function that returns the CSS `grid-column` value. This kept T2
truly a refactor (no migration of stored state) and let T3 introduce
the third-width option cleanly.

**Edit-control overlay placement.** The dashboard originally had its
move/hide/width buttons inline in each tile's header (flex
`justify-between` with the title block on the left). The extraction
moves them to an absolutely-positioned floating panel at top-right of
the section, with a backdrop (`bg-white/95 / dark:bg-gray-800/95`,
small border, shadow) so the title underneath doesn't bleed through.
Visual diff is minimal — the controls still appear in the same
vicinity as before — and the abstraction is much cleaner. Per-tile
slots can stay pure content without each having to render the
identical edit-button strip.

**`calendarContainerRef` via `defineExpose`.** The dashboard's
calendar heatmap sizes itself to the available tile width via
`useElementSize` against the section element. With `TileGrid` owning
the section, the dashboard now reads `tileGridRef.value.sectionEls
['calendar-heatmap']` through a computed ref. `TileGrid` exposes
`sectionEls` as a `Partial<Record<TId, HTMLElement>>` keyed by tile
id; the parent attaches `useElementSize` to that.

**`layoutLoaded` race guard.** T4 only fires the debounced PUT after
the initial GET settles. Otherwise a user who clicks "Edit layout"
during the first network round-trip would race the load — the first
mutation's PUT would land before the GET's response was applied,
overwriting their saved layout with defaults. The flag is the
narrowest fix; flipping it true even on fetch error is intentional
so the user can still customize even when preferences is offline.

## What I'd do differently

1. **The migration block in the transformation script was the riskiest
   step and the least tested.** I wrote a Python script to rewrite
   ~1500 lines of `DashboardView.vue` template (replacing 7
   `<section>` blocks with `<template #tile-X>` slots and removing
   ~600 lines of repeated edit-button markup). The dashboard tests
   passed first try, but if any tile's structure had varied from the
   pattern the script assumed (e.g. mood-trends has `flex-wrap` in
   its header), I would have silently dropped or mangled content.
   A safer approach for the next big extraction: do the first tile by
   hand, then template the script off that, then run it against the
   remaining tiles one at a time.

2. **`/fitness` charts inside a 6-column grid look thinner at default
   widths.** The dashboard's 2-column grid gives each "half" tile ~50%
   page width; `/fitness`'s "third" tiles get ~33%. Sleep / HRV / RHR
   were previously in a `grid-cols-1 lg:grid-cols-3` flow which is
   visually identical at lg+ breakpoints, but the canvas height (h-48)
   may feel pinched alongside the wider full-width tiles. Worth a
   visual review post-deploy; if it's too cramped, default sleep /
   hrv / rhr to `half` (span 3) instead and let users opt into `third`.

3. **T4 has no integration test against a real preferences endpoint.**
   The store tests mock `fetchPreferences` / `updatePreferences`
   directly. That covers the debounce / race / round-trip logic on
   the client, but a regression in the preferences serializer or
   route would slip past. The server has its own contract test from
   the T1 close, so combined coverage is acceptable for now, but if
   prefs ever grows a typed schema on the backend, a webapp-side
   integration test against the real route would be cheap insurance.

## Cross-references

- Server plan: [`../../server/docs/fitness-tile-layout-plan.md`](../../server/docs/fitness-tile-layout-plan.md)
- Prior session journals:
  - [`260511-fitness-tile-layout-t7.md`](./260511-fitness-tile-layout-t7.md) — T7 webapp side
  - [`260511-fitness-followup-shipped.md`](./260511-fitness-followup-shipped.md) — F2–F8 wrap
- Server counterpart for the same plan:
  [`../../server/journal/260511-fitness-tile-layout-t1-t7.md`](../../server/journal/260511-fitness-tile-layout-t1-t7.md)
