# Storylines TOC: newest chapter first

**Date:** 2026-07-13

## What

User feedback on the storylines reader: the episodes side panel (`ChapterToc`)
listed chapters oldest-at-the-top, mirroring the reader's book order. Flipped
the panel to newest-first — the in-progress draft now sits on top, then the
most recent published chapter, and so on down.

## How

- `ChapterToc.vue` now derives `displayChapters` (a reversed copy of the
  `chapters` prop) and renders that. The reversal lives inside the component
  so it owns its presentation; the parent (`StorylineDetailView`) still passes
  chronological order and the reader keeps its oldest-first flow.
- Test-first: added a spec asserting `toc-item-3, toc-item-2, toc-item-1`
  render order (draft first), watched it fail, then applied the fix.

## Notes

- One `test:coverage` run exited 1 from a flaky unhandled `AbortError` in
  unrelated job-polling tests (all 1888 tests passed, thresholds met). Clean
  on rerun and on a stashed tree — not caused by this change, but worth
  watching if it recurs on pushes.
- `docs/storylines.md` updated to state the panel's newest-first order.
