# 1. Storylines reader — most recent on top

**Date:** 2026-07-17
**Branch:** `eng-storylines-recent-on-top` (worktree; fitness view worked in a
parallel session)

## 1.1 Motivation

In the `/storylines/:id` reader we want the most recent chapter at the top on
both sides of the layout — the chapter-selection list (left) and the story
texts (right).

## 1.2 What changed

Only the **right-hand reader panel** in `StorylineDetailView.vue` needed to
change:

- Added a `publishedChaptersNewestFirst` computed (`[...publishedChapters].reverse()`;
  the API returns chapters oldest-first).
- Reordered the template so the draft block renders **on top**, followed by the
  published chapters newest → oldest.
- Updated the component and layout doc comments to match.

The **left TOC** (`ChapterToc.vue`) was already newest-first (it reverses the
chapter list, draft on top) and is locked by an existing test
(`renders newest chapter first (reverse chronological)`), so it was left
untouched.

## 1.3 Preserved behaviour

`newestPublishedId` / `is-newest`, the `data-chapter-anchor` scroll targets,
the `?chapter=` deep-link scroll, read-on-visible marking, and the empty state
all continue to work — only DOM order flipped, not the data or wiring.

## 1.4 Tests

TDD: added a failing test asserting the reader's `[data-chapter-anchor]` DOM
order is `[draft, published-newest, …, published-oldest]` (`['72','71','70']`
for a 3-chapter fixture), then implemented until green. Full webapp suite +
coverage (above the 85% thresholds), format, lint, and build all pass.
