# Mood Trends Chart — Focused Evaluation

## Executive summary

Tightly-scoped UX work on the dashboard's Mood Trends chart. Two bugs reproduced
from screenshots, both root-caused. New requirement: surface the four conceptual
groups from `mood-dimensions.toml` (affect axes / psychological needs / active
negative affect / stance) as bulk-toggle group labels above the per-dimension pills.

## Files in scope

- `src/views/DashboardView.vue` — chart card, dimension pills, render function (single 2.8k-line file; mood-trends section is lines ~2095–2240, render fn lines 362–471, watcher lines 915–919)
- `src/stores/dashboard.ts` — `hiddenMoodDimensions` Set state, `toggleMoodDimension` / `showAllMoodDimensions` / `hideAllMoodDimensions` actions
- `src/utils/mood-display.ts` — `displayLabel` helper for the `frustration→calm` inversion (must be preserved)
- `src/stores/__tests__/dashboard.test.ts` — store-level tests of toggle actions
- `src/views/__tests__/DashboardView.test.ts` — component tests of the toggle UI

No backend changes (per user). The grouping data is currently a comment in
`server/config/mood-dimensions.toml` (lines 42–46). Mapping must live in webapp.

## Bug A — "deselect the only visible series → empty state"

**[VERIFIED via code reading]** Reproduction: agency is the only visible
dimension by default (store applies `DEFAULT_ISOLATED_MOOD = 'agency'` and adds
the rest to `hiddenMoodDimensions`). User clicks the agency pill →
`toggleMoodDimension('agency')` adds it to the hidden set → now all 7 are hidden →
`allMoodDimensionsHidden` computed becomes `true` → template falls into the
`v-else-if="allMoodDimensionsHidden"` branch (line 2216) showing "All dimensions
hidden / Show all".

**Root cause:** the state model is "hidden set" (`hiddenMoodDimensions`). Empty
hidden set means "all visible". Full hidden set is treated as a special "all
hidden" state. The user's mental model is "selected set" — empty selection
should mean "show all" (the default), not "show nothing".

**Fix:** invert the state model to a `selectedMoodDimensions` Set with the
contract: empty = show all; non-empty = show only these. The "all hidden" branch
disappears entirely. Bug A becomes structurally impossible.

## Bug B — clicking "Show all" leaves the chart blank

**[VERIFIED via code reading]** When the empty state is showing, the
`<canvas ref="moodChartCanvas">` is **not in the DOM** (it's behind the `v-else`
at line 2231). Clicking `Show all` calls `store.showAllMoodDimensions()` which
empties the hidden set. The `watch([..., () => store.hiddenMoodDimensions], ...)`
at line 915 fires synchronously (Vue 3 default `flush: 'pre'` runs watchers
*before* the DOM patch). At that moment, `moodChartCanvas.value` is still `null`
because Vue hasn't yet mounted the v-else branch. `renderMoodChart()` early-returns
on line 363 (`if (!moodChartCanvas.value) return`). After Vue patches the DOM,
nothing triggers another render → blank canvas.

**Fix:** add `flush: 'post'` to the watcher (or wrap render in `await nextTick()`).
The selection-semantic refactor from Bug A also incidentally removes the empty
state branch, eliminating the v-if-mount race for the all-hidden → all-visible
transition specifically. But other transitions (loading → loaded, hidden tile →
visible tile) have the same race latent today; `flush: 'post'` is the durable
fix.

## New feature — grouped toggles

Groups (per toml lines 42–46):

| Group                   | Dimensions                          | Scale    |
|-------------------------|-------------------------------------|----------|
| Affect axes             | joy_sadness, energy_fatigue         | bipolar  |
| Psychological needs     | agency, fulfillment, connection     | unipolar |
| Active negative affect  | frustration                         | unipolar |
| Stance                  | proactive_reactive                  | bipolar  |

**Design:** hierarchical layout. A small group label sits above each row of
dimension pills, separated by visual gaps. The group label is itself a
clickable bulk-action: if any of the group's members are in the selection,
click clears them from the selection; otherwise click adds them all.

**Group state visual:** the dot/check on the group label reflects partial vs
full inclusion (analogous to a tristate checkbox), but kept lightweight — no
need for a full tri-state widget.

**Mapping placement:** new `src/utils/mood-groups.ts` with a const ordered
array of `{ id, label, members: string[] }`. Order matches toml. Dimensions
loaded from the server that aren't in any group fall through to a final
"Other" group rendered without a label (graceful degradation if the toml
adds a new dimension and the webapp const isn't updated yet).

## Test coverage

Existing dashboard store + view tests cover the current `hiddenMoodDimensions`
semantics in detail. They will need a coordinated update — this is not a
silent rename; the contract changes. Plan in Phase 2 covers the migration.

Coverage thresholds enforced by pre-push and CI: 85% statements / branches /
functions / lines (see `vitest.config.ts`). Adding the group-toggle UI must
not push any of these below threshold.

## Risk assessment

Low. All changes are local to the dashboard mood-trends card. No API contract
changes, no schema changes, no other consumers of the affected store actions.
The renamed action set is private to this component.
