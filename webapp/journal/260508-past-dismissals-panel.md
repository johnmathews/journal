# 2026-05-08 — Past dismissals panel + undo

## Context

Companion to the journal-server changes (eng-entity-dedup branch) that added persistent
"not a duplicate" decisions across extraction runs. This webapp side adds a UI surface to
audit and undo those decisions.

## What changed

- `src/types/entity.ts` — new `PairDecision` and `PairDecisionsResponse` types.
- `src/api/entities.ts` — `fetchPairDecisions(params)` and `deletePairDecision(id)` typed
  client wrappers.
- `src/stores/entities.ts` — `pairDecisions` / `pairDecisionsTotal` /
  `pairDecisionsLoading` state plus `loadPairDecisions()` and `undoPairDecision()`
  actions. Loaded eagerly on `EntityListView` mount alongside merge candidates and
  quarantined entities.
- `src/views/EntityListView.vue` — new "Past dismissals" panel rendered between the merge
  review banner and the selection toolbar. Shows a count badge, expands on click, and
  lists each rejected pair with both entity names, type badges, decision date, and an
  "Undo" button that calls `DELETE /api/entities/pair-decisions/{id}`.

## Tests

- `src/stores/__tests__/entities.test.ts` — `pair decisions` describe block: load
  populates state, load surfaces error, undo filters and decrements total.
- `src/views/__tests__/EntityListView.test.ts` — `past dismissals panel` describe block:
  renders panel + badge when dismissals exist, toggles list on click, clicking Undo calls
  the API and removes the row, hides the section when no dismissals.

`npm run test:coverage` passes — branches 85.06%, lines 93.33%, statements 91.19%,
functions 88.25%. All four metrics above the 85% pre-push threshold.

## Companion server changes

The endpoints this consumes are added in `journal-server`'s `eng-entity-dedup` branch:

- `GET /api/entities/pair-decisions?limit=&offset=` — list rejections.
- `DELETE /api/entities/pair-decisions/{id}` — undo one.

The webapp's `loadPairDecisions` requests `limit=200` because the dataset is small
(54 dismissals after a year of use) and pagination wasn't worth the UI complexity.
