# Mood Trends Chart — Improvement Plan

## Work units

### Unit 1 [Critical] — Fix Bug B: render race after DOM mount

**Problem:** `watch([store.moodBins, store.hiddenMoodDimensions], renderMoodChart)`
in `DashboardView.vue` runs at Vue's default `flush: 'pre'`, so it fires before
Vue patches the DOM. After a transition that mounts/unmounts the canvas (e.g.
the "all hidden" → "show all" path), `moodChartCanvas.value` is `null` when the
watcher fires, render early-exits, no re-trigger.

**Change:**
- `DashboardView.vue` line ~915: change the watcher options to `{ deep: false, flush: 'post' }`.

**Tests:**
- New test in `DashboardView.test.ts`: after a transition that toggles the canvas
  v-if branch, the chart re-renders. Easiest probe: spy on the chart constructor
  via the existing chart.js mock.

**Acceptance:** unit test asserts that flipping from the "no canvas" branch to
the canvas branch triggers a `renderMoodChart` call after DOM update.

---

### Unit 2 [Critical] — Fix Bug A: selection semantics

**Problem:** Empty selection currently triggers an "All dimensions hidden" empty
state, contradicting the user's mental model of "no selection = show all".

**State model change** in `src/stores/dashboard.ts`:
- Rename `hiddenMoodDimensions: Set<string>` → `selectedMoodDimensions: Set<string>`
- Contract: **empty set = show all dimensions**; non-empty = show only the named subset
- Default initialization on first `loadMoodDimensions`: `new Set(['agency'])` (matches the existing
  `DEFAULT_ISOLATED_MOOD` behaviour — agency-only on first load). Keep a one-shot guard so reloads after a config edit don't reset the user's selection mid-session.
- Rename actions:
  - `toggleMoodDimension(name)` — add/remove `name` from selection
  - `showAllMoodDimensions()` — keep, now clears the selection (empty = show-all)
  - `hideAllMoodDimensions()` → **delete** (no coherent meaning under selection semantics; per design decision (2) the "None" affordance is removed)
- Helper computed/getter in the store: `isMoodDimensionVisible(name)` — `true` if selection is empty OR contains `name`.

**Template change** in `src/views/DashboardView.vue`:
- Per-pill state binding flips: `aria-pressed`, dimmed style, and chip click semantics now use `store.isMoodDimensionVisible(d.name)`.
- **Drop** the `v-else-if="allMoodDimensionsHidden"` empty-state branch and its `dashboard-mood-all-hidden` test ID + the inner "Show all" link.
- **Drop** the `None` button (`dashboard-mood-hide-all`). Keep `All` as a "reset to default → show all" affordance, disabled when selection is already empty.
- **Drop** the `allMoodDimensionsHidden` computed in the view setup.

**Render function change** at line 379:
- Replace `if (store.hiddenMoodDimensions.has(d.name)) continue` with
  `if (!store.isMoodDimensionVisible(d.name)) continue`.

**Tests:**
- `dashboard.test.ts`:
  - Default selection contains only `agency` (preserves existing behaviour).
  - `toggleMoodDimension` flips membership both ways, creates new Set for reactivity.
  - `showAllMoodDimensions` clears selection (size === 0).
  - `isMoodDimensionVisible` returns true for empty selection (any name).
  - `isMoodDimensionVisible` returns true only for selected names when non-empty.
- `DashboardView.test.ts`:
  - Deselecting the last selected pill leaves the chart visible (regression test for Bug A).
  - The empty-state DOM (`dashboard-mood-all-hidden`) no longer exists.
  - The `None` button (`dashboard-mood-hide-all`) no longer exists.
  - The `All` button is disabled when selection is empty, enabled otherwise.

**Acceptance:** existing toggle behaviour preserved (agency-only default still ships on first load), Bug A reproduction no longer reaches the empty state.

---

### Unit 3 [High] — Group-toggle UI

**Mapping module:** new `src/utils/mood-groups.ts`:

```ts
export interface MoodGroup {
  id: 'affect' | 'needs' | 'negative' | 'stance' | 'other'
  label: string
  members: string[] // dimension names in toml order within the group
}

export const MOOD_GROUPS: readonly MoodGroup[] = [
  { id: 'affect',   label: 'Affect axes',           members: ['joy_sadness', 'energy_fatigue'] },
  { id: 'needs',    label: 'Psychological needs',   members: ['agency', 'fulfillment', 'connection'] },
  { id: 'negative', label: 'Active negative affect', members: ['frustration'] },
  { id: 'stance',   label: 'Stance',                members: ['proactive_reactive'] },
]
```

Plus a derived helper:

```ts
export function groupDimensions(dimensions: MoodDimension[]): {
  group: MoodGroup
  members: MoodDimension[] // only those present in `dimensions`, in toml order
}[]
```

Iterates `MOOD_GROUPS` in declaration order; within each group preserves the order from the input `dimensions` list (which comes from the server in toml order). Any dimensions not in any group go into a final `'other'` group with an empty label (rendered without a header). Graceful degradation if the toml adds a new dimension and the webapp const hasn't caught up.

**Group action helpers** in `src/stores/dashboard.ts`:

```ts
function moodGroupSelectionState(memberNames: string[]): 'all' | 'some' | 'none'
function toggleMoodGroup(memberNames: string[]): void
```

`toggleMoodGroup` semantics:
- If any member of `memberNames` is in `selectedMoodDimensions` → remove all members from the selection.
- If no member is selected → add all members.
- (Clicking always brings the group to a uniform state; never leaves it partial.)

This composes naturally with the existing per-pill toggle so the user can build any subset.

**Template change** in `src/views/DashboardView.vue`:

Replace the single dimension row with a column containing one row per group; each row has a clickable group label followed by the group's dimension pills. The `All` action sits on its own line at the end.

**Group label visual:** small chip matching the dimension chip style but with a muted neutral background; the leading marker shows tristate:
- empty circle → `none` of group selected (group hidden because selection narrowed to other groups, OR baseline empty-selection-shows-all)
- filled circle → `all` group members in selection
- half-filled → `some` selected

Subtle styling, not a focal point — the per-dimension pills remain primary.

**Tests:**
- `mood-groups.test.ts` (new): `groupDimensions` orders correctly; ungrouped names fall into `other`; missing members are filtered out.
- `dashboard.test.ts`: `toggleMoodGroup` adds when none selected; removes when any selected; `moodGroupSelectionState` returns correct tristate.
- `DashboardView.test.ts`:
  - Clicking the "Affect axes" group label adds `joy_sadness` + `energy_fatigue` to selection.
  - Clicking it again removes both.
  - Clicking it when one member is already selected removes both (uniform state).
  - Group labels render in toml order.

**Acceptance:** four group sections render in toml order; group click toggles all members; per-pill toggles still work; tab order through pills is unchanged within rows.

---

### Unit 4 [High] — Playwright verification

Standalone unit. Runs after Units 1–3 are merged on the worktree branch.

**Steps:**
1. Start journal-server backend (`uv run python -m journal.mcp_server` from `../../../../server`).
2. Start `npm run dev` in the worktree.
3. Use Playwright MCP tools to log in (`dev@local.dev` / `devpassword123`).
4. Navigate to `/dashboard`. Capture screenshots:
   - `mood-trends-default.png` — initial state (agency-only, default).
   - `mood-trends-bug-a-fixed.png` — click agency pill (deselect it), confirm chart still rendered with all dimensions visible.
   - `mood-trends-bug-b-fixed.png` — return to agency-only, click All, confirm chart shows everything (no blank state).
   - `mood-trends-group-toggle.png` — click "Psychological needs" group label, confirm only those three dimensions render.
   - `mood-trends-multi-group.png` — click "Affect axes" group, confirm both groups' members visible together.
5. Save screenshots to `journal/screenshots/2026-05-05-mood-trends/`.
6. Capture `browser_console_messages` after each step; report any errors.

**Acceptance:** all five screenshots saved; no console errors related to chart rendering; visual state matches expected behaviour for each scenario.

---

### Unit 5 [Medium] — Journal entry

- Write `journal/260505-mood-trends-grouping-and-bug-fixes.md` covering the state-model refactor, the bug fixes, the group UI, and the screenshots.
- No `docs/` updates needed — the chart is user-facing UI, not a documented surface contract.

**Acceptance:** journal entry written and references screenshots.

## Sequencing

1. Units 1 + 2 + 3 are independent at the test-design level but converge on the same `DashboardView.vue` chunk. Implement in this order in a single sweep so test churn is bounded:
   - **1 first** (watcher fix is a single-line change, low blast radius)
   - **2 second** (state-model refactor — cascades through tests)
   - **3 third** (group UI on top of the new state model)
2. Run `npm run test:unit` after each unit; full coverage run at the end.
3. **Unit 4** (Playwright) runs after the test suite is green.
4. **Unit 5** (journal) runs last, after screenshots exist.

## Out of scope

- Persisting the selection across sessions (currently in-memory only — same as today; noting for future).
- Changing the toml or backend to surface group metadata.
- Refactoring the 2.8k-line `DashboardView.vue` into smaller components (separate concern, separate session).
