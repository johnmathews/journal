# Editable storyline title + browser-back on detail views

**Date:** 2026-06-11

## What

Two webapp changes, both user-requested:

1. **Editable storyline title.** `/storylines/:id` already let you edit the
   anchors; you can now rename the storyline itself, so the title can track
   anchor edits. The `<h1>` heading gains a pencil affordance that swaps it for
   an inline input + Save/Cancel. Save trims and persists via the new
   `PATCH /api/storylines/{id}` (store action `renameStoryline`); Cancel /
   Esc discards. Save is disabled while the draft is blank or a request is in
   flight. A rename is metadata-only — it never touches the panels — so it
   pairs with anchor editing without forcing a regeneration.

2. **Back buttons do a real browser back.** The three detail views
   (`StorylineDetailView`, `EntityDetailView`, `EntryDetailView`) used to
   `router.push({ name: '<section-list>' })`, which always jumped to that
   section's overview. Jumping storyline → entity and back sent you to the
   entities list instead of the storyline you came from. Now they call a shared
   `useBackNavigation(fallback)` composable that does `router.back()` when there
   is in-app history and only falls back to the section list when there isn't.

## How

- `composables/useBackNavigation.ts` — returns a `goBack` handler. Browser-back
  iff `window.history.state?.back != null` (Vue Router records the previous
  in-app location there); otherwise `router.push(fallback)`. The fallback covers
  fresh loads, refreshes, and deep links where `router.back()` would leave the
  app entirely.
- `api/storylines.ts` `updateStoryline()` + `types/storyline.ts`
  `UpdateStoryline{Request,Response}`.
- `stores/storylines.ts` `renameStoryline(id, name)` with `savingName` /
  `nameError` state; refreshes `currentStoryline.name` and the matching list row
  from the authoritative server response (server trims, so we echo its value).

## Tests

- `composables/__tests__/useBackNavigation.test.ts` — both branches (back vs.
  fallback) plus the `history.state === null` case.
- View tests: the existing back-button assertions still hold (test env has no
  `history.state.back`, so they exercise the fallback); added a browser-back case
  in `StorylineDetailView.test.ts`, plus the full rename UI flow (open, seed,
  trim, save, cancel, blank-disabled).
- Store + API tests for `renameStoryline` / `updateStoryline`.

Full suite: 1745 passed, coverage above the 85% thresholds. Server side documented
in `journal-server/journal/260611-storyline-rename-endpoint.md`.
