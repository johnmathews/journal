# Storyline regenerate modal: re-segment toggles

**Date:** 2026-06-15
**Branch:** `eng-storyline-chapters`

## What and why

The backend gained word-sized, titled, auto-split storyline chapters (see the
journal-server entry of the same date). This is the webapp half (W6): expose the
new **re-segment** capability in the existing `StorylineRegenerateModal`.

## Changes

- `src/types/storyline.ts`: `RegenerateStorylineRequest` gains optional
  `resegment?: boolean` and `override_locked?: boolean`. The api client already
  forwards any defined body field, so no client change was needed beyond the type.
- `StorylineRegenerateModal.vue`:
  - **"Re-segment into chapters"** checkbox (`data-testid=
    storyline-regenerate-resegment`), default off. When checked, the modal posts
    `{resegment: true}` to re-carve the storyline into titled ~200-word chapters
    instead of refreshing the current ones.
  - A secondary **"Ignore my hand-painted chapters"** checkbox
    (`data-testid=storyline-regenerate-override-locked`) appears only when
    re-segment is on; adds `{override_locked: true}`.
  - Re-segment is mutually exclusive with Append (the server rejects the
    combination). Three guards enforce it: a `watch` forces Replace when
    re-segment toggles on, the mode/date controls are hidden while it's on, and
    `onSubmit` branches so an `append + resegment` body can never be built. False
    booleans are never sent.
- No word-count badge (word count is a soft server-side target).
- Added a `StorylineDetailView` test asserting multiple chapter titles render in
  the strip (the storyline now produces many chapters, not one).

## Status

`npm run test:coverage` green — 1827 tests, coverage 92.1 / 85.9 / 90.9 / 94.3%
(all ≥85). Lint clean, build passes.
