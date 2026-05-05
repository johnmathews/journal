# 2026-05-05 — Mood Trends: grouped toggles + two bug fixes

The dashboard's Mood Trends chart had two bugs and was missing a way to toggle dimensions
in conceptual groups. This change fixes both bugs and surfaces the four groups
(affect axes / psychological needs / active negative affect / stance) the toml's leading
comment defines.

## Bugs fixed

### Bug A — deselecting the only visible series produced an "All hidden" empty state

The chart used a `hiddenMoodDimensions` set with the contract "empty = all visible, full =
all hidden". Clicking the lone-visible chip flipped its hidden bit and tipped the set into
the "all hidden" branch, showing an empty state. That contradicted the user's mental model
of "no selection = show all".

**Fix:** invert the state model from `hiddenMoodDimensions` to `selectedMoodDimensions`.

- Empty selection means **show every dimension** (the default the user wants).
- Non-empty means **show only the named subset**.
- Default on first load: `Set(['agency'])` — preserves the existing agency-only landing view.

The "all hidden" empty-state branch and the `None` button were dropped (no coherent meaning
under the new semantics — confirmed by the user). The `All` button stays as a "reset to
show-all" affordance, disabled when the selection is already empty.

### Bug B — clicking "Show all" produced a blank chart

The watcher that re-renders the chart on `moodBins` / `selection` changes ran at Vue's
default `flush: 'pre'`, *before* the DOM patch. After a transition that mounted the canvas
(e.g. coming back from the "all hidden" branch), the canvas ref was still `null` when the
watcher fired and `renderMoodChart()` early-returned. Vue then patched the DOM, but nothing
re-triggered the render → blank canvas.

**Fix:** `flush: 'post'` on the watcher. The watcher now runs *after* Vue patches the DOM,
so the canvas ref is live by the time we draw. This is also a latent fix for any future
v-if transition involving the canvas.

Bug B's specific reproduction path (all-hidden → show-all) is also gone now that Bug A's
fix removes the all-hidden branch entirely, but `flush: 'post'` is the durable fix.

## New: grouped-toggle UI

The four conceptual groups (per `server/config/mood-dimensions.toml` lines 42–46) now have
their own bulk-action chip above each group's pills. Order matches the toml.

| Group                   | Dimensions                          |
| ----------------------- | ----------------------------------- |
| Affect axes             | joy_sadness, energy_fatigue         |
| Psychological needs     | agency, fulfillment, connection     |
| Active negative affect  | frustration                         |
| Stance                  | proactive_reactive                  |

**Click semantics** (additive bulk action, decided up-front with the user):
- If any member of the group is in the selection → clicking the group chip removes all members.
- If no member is in the selection → clicking adds them all.
- Always lands in a uniform state — never partial.

**Group chip visual:** small pill with a tristate marker:
- empty circle → no members selected
- filled circle → all members selected
- half-fill → some selected (mixed)

**Per-pill toggles** still work for fine control. The mapping lives in
`src/utils/mood-groups.ts`. New dimensions added to the toml without a webapp mapping
fall through to a trailing "other" bucket (rendered without a header) for graceful
degradation.

## Files changed

- `src/stores/dashboard.ts` — renamed state, added `isMoodDimensionVisible`,
  `moodGroupSelectionState`, `toggleMoodGroup`. Dropped `hideAllMoodDimensions`.
- `src/views/DashboardView.vue` — grouped template, watcher flush:'post',
  empty-state branch + None button removed.
- `src/utils/mood-groups.ts` — new mapping + `groupDimensions` helper.
- `src/utils/__tests__/mood-groups.test.ts` — new.
- `src/stores/__tests__/dashboard.test.ts` — updated for the new contract,
  added Bug A regression test + group helper tests.
- `src/views/__tests__/DashboardView.test.ts` — Bug A regression test, group toggle
  interaction tests, removed assertions on the dropped DOM.

## Verification

Unit suite: 1281 / 1281 pass. Coverage above the 85% threshold across the board
(statements 91.4%, branches 85.2%, functions 88.2%, lines 93.3%).

Playwright walk-through against the local stack (synthetic mood-score seed used because
the dev DB had no scored entries — see `/tmp/seed_mood.py` in the worktree, reverted
after capture). Screenshots saved under `journal/screenshots/2026-05-05-mood-trends/`:

1. `01-default-agency-only.png` — initial state, agency selected, group chips show
   PSYCHOLOGICAL NEEDS as half-filled (some).
2. `02-bug-a-fixed-deselect-last.png` — clicking agency (the only selection) leaves the
   chart fully visible with all 7 dimensions, **not** an empty-hidden state.
3. `03-bug-b-fixed-all-button.png` — `All` button correctly resets to show-all.
4. `04-group-toggle-needs.png` — clicking the PSYCHOLOGICAL NEEDS chip selects all
   three members exactly; other groups dimmed.
5. `05-multi-group-affect-plus-needs.png` — clicking AFFECT AXES on top adds both
   members to the selection without disturbing the existing group selection.

No console errors during chart interactions.

## Out of scope (intentional)

- Persisting the selection across sessions — still in-memory, same as before.
- Surfacing group metadata from the server. The toml comment remains the source; the
  webapp keeps its own const mapping.
- Refactoring `DashboardView.vue` (2.8k lines) into smaller components — separate concern.
