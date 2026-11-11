# 2026-05-05 — Display-only inversion of `frustration` → `calm`

Sibling to the server-side journal entry of the same date. The server change tightened the
`connection` notes; this side handles the chart consistency problem with `frustration`.

## Why

Every mood dimension on the dashboard reads "higher = better" except `frustration`, where a high
unipolar score means a worse mood. That made the chart hard to scan — was the spiking line good
or bad? Discussed four options (rename to unipolar `calm`, convert to bipolar `calm_frustrated`,
display-only inversion, or just annotate the legend) and picked **display-only inversion**.

The reasoning: detecting an active negative signal (frustration / anger / blocked goals) is much
easier for the LLM than detecting baseline calm. So we keep the server-side scoring as
`frustration` (unipolar 0..1) — the API contract, the `mood_scores` rows, the LLM tool schema, and
the prompt all stay identical — and the dashboard renders it as `1 - score` with the label "calm".
Storage and display diverge by exactly one transform, contained in one file.

## What changed

1. **`src/utils/mood-display.ts`** (new): pure helpers `displayLabel(d)`, `displayScore(d, score)`,
   and `isDisplayInverted(name)`, plus the `DISPLAY_INVERTED_DIMENSIONS = { frustration: 'calm' }`
   map. Adding a new inverted dimension later means adding one line here.
2. **`src/utils/__tests__/mood-display.test.ts`** (new): seven tests covering the helpers — the
   map shape, the label override, score inversion at boundaries (0 → 1, 0.25 → 0.75, 1 → 0),
   non-inverted pass-through (incl. negative bipolar scores), and `null` propagation.
3. **`src/views/DashboardView.vue`**: applied the helpers in five spots
   - **Chart pivot (`pivotMoodBins`)**: `displayScore` for the average series; for the
     min/max band, both pass through `displayScore` AND swap (because `1 - smallest = largest`,
     so the inverted band's lower bound is the original upper bound).
   - **Chart legend pill**: `{{ displayLabel(d) }}` instead of `{{ d.positive_pole }}`.
   - **Entity-correlation dimension picker**: same swap.
   - **Entity-correlation chart**: a single `toDisplay()` helper applied to both `overallAvg` and
     each item's `avg_score`. The above/below-average colour comparison is then done on the
     displayed values, so green = above average for the displayed sense (high calm = good).
   - **Drill-down panel**: header now shows `displayLabel`, individual entry scores run through
     `drillEntryDisplayScore` so the column matches the chart line you clicked.

### Note on a side-effect

The drill-down header used to show the raw snake_case `store.drillDimension` (e.g. `joy_sadness`).
Routing it through `displayLabel` means non-inverted dimensions now display as their
`positive_pole` too (`joy` instead of `joy_sadness`). I kept this change because:

- It's consistent with every other place in the dashboard that uses `positive_pole` as the
  human label.
- snake_case in user-facing UI was a small wart anyway.

The matching test in `src/views/__tests__/DashboardView.test.ts` was updated to assert the new
behaviour explicitly (asserts `'joy'` is shown and `'joy_sadness'` is not).

## What does NOT change

- `mood_scores` table rows.
- The `/api/dashboard/mood-trends` and `/api/dashboard/mood-entity-correlation` payloads.
- The LLM `record_mood_scores` tool schema (still asks the model to score `frustration` as
  presence-of-active-negative-affect, 0..1).
- `config/mood-dimensions.toml` `name`, `positive_pole`, or `scale_type` for `frustration`.

So no migration, no `journal backfill-mood` run required for this change. (The server's
connection-notes edit is also notes-only and a backfill there is optional.)

## Tests / lint

- `npm run test:unit -- --run`: 1261 passed (up from 1260; +1 from the new mood-display tests
  that all pass, with one existing drill-down test updated to match the new header label).
- `npm run lint`: clean.
- `npx vue-tsc --noEmit`: clean.
