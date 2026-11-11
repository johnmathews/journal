# Storylines (webapp)

**Status:** active reference. Last updated 2026-07-12 (draft/published reader
redesign — see the server spec
`journal-server/docs/superpowers/specs/2026-07-12-storylines-redesign-design.md`).

A storyline is an entity-anchored, AI-synthesized narrative about a recurring
thread in the journal, split into **chapters**. Published chapters are
immutable episodes delivered to the reader; each storyline has exactly one
**draft** chapter that grows as new entries arrive. Chapter boundaries are
decided semantically by an LLM judge on the server — there is no manual
chapter editing in the webapp.

## Routes

| Route | View | Purpose |
| --- | --- | --- |
| `/storylines` | `StorylineListView` | Sortable table (cards on mobile) with unread badges, create modal, delete |
| `/storylines/:id` | `StorylineDetailView` | Book-style reader: TOC + published chapters + draft block |

The sidebar's Storylines link carries a violet badge with the total unread
chapter count (`storylinesStore.totalUnread`).

## Reading experience

`StorylineDetailView` renders the storyline most-recent-first — both the TOC
and the reader put the newest chapter on top:

- **`ChapterToc`** (left at `lg+`, sticky) — one row per chapter, listed
  newest-first (draft's "In progress" row on top): title, derived date range
  (min/max of the chapter's member entries), a violet unread dot on
  published-unread chapters, and a subdued "In progress" row for the draft.
  Selecting a row scrolls the chapter into view and writes `?chapter=<id>` to
  the URL.
- **`ChapterReader`** — one per published chapter, ordered newest → oldest
  below the draft: date-range eyebrow, title, the cited narrative (rendered by
  `StorylineNarrative`, prose + footnote Sources with entry links), addenda as
  bordered "Later — <date>" blocks, and a footer with the published date and a
  ⋯ menu (Rename / Mark unread / Unpublish — Unpublish only on the newest
  published chapter). When ≥60% of a chapter scrolls into view
  (IntersectionObserver) it emits `visible` once; the view marks it read via
  the store.
- **`DraftBlock`** — the draft chapter, rendered **first (on top)** and
  visually subdued (dashed border, muted prose): "In progress — N entries", the
  provisional narrative if one exists, and a **Refresh** button that queues a
  re-narration job.

Citation numbering restarts per chapter: `buildCitationRegistry` walks the
chapter's segments then each addendum's, assigning `[N]` per unique
`entry_id`.

## Read state

- `read_at == null` on a published chapter means unread. Scrolling it into
  view marks it read **optimistically** (badge counts drop immediately, roll
  back on API failure). "Mark unread" in the chapter menu restores the badge.
- The list view shows a per-storyline `unread_count` badge; the sidebar sums
  them (`totalUnread`).

## Mutations (all others happen server-side via jobs)

- **Create** (`StorylineCreateModal`): entity multi-select (1..15 anchors),
  auto-name, optional description. The server bootstraps chapters from the
  existing history; the returned `bootstrap_job_id` is tracked by the store
  (`updating` flag) and the view reloads when it completes.
- **Refresh** (DraftBlock): `POST /api/storylines/{id}/refresh` → 202 + job.
- **Unpublish** (chapter menu, newest published only, `window.confirm`):
  `POST /api/storylines/{id}/chapters/unpublish` → 202 + job. Folds the
  chapter's entries back into the draft.
- **Rename chapter** (inline form in the reader): `PATCH .../chapters/{cid}`.
- **Read/unread**: `POST .../chapters/{cid}/read` / `/unread`.
- **Anchors** (`StorylineAnchorEditor`, inline): `PUT .../anchors`, with a
  confirm step offering "Save & refresh" (chains the refresh job) or "Save
  only".
- **Rename / delete storyline**: header controls, as before.

Deleted with the redesign: the curation panel + date-mode toggle, the
regenerate modal (bulk and per-row), and all chapter window editing
(add/split/merge/date-edit/delete + locks).

## Store (`src/stores/storylines.ts`)

State: `storylines` (+`totalUnread` computed), `currentStoryline`
(detail + chapter meta), `chapterCache: Map<chapterId, ChapterDetail>`
(published chapters are immutable, so cache hits are always valid; cleared
when the storyline changes or an update job lands), `updating` (single flag
for any in-flight `storyline_update` job), plus the usual loading/error
refs.

Job tracking: `_trackUpdateJob` registers the job with `useJobsStore`
(`'storyline_update'` type), holds `updating` until the job is terminal,
then clears the chapter cache and reloads detail + list.

## API client (`src/api/storylines.ts`)

`fetchStorylines`, `fetchStoryline`, `fetchChapter`, `createStoryline`,
`updateStoryline`, `deleteStoryline`, `setStorylineAnchors`,
`refreshStoryline`, `unpublishNewest`, `markChapterRead`,
`markChapterUnread`, `renameChapter`. Types in `src/types/storyline.ts`
mirror the server serializers in `journal-server`
`src/journal/api/storylines.py` exactly.

## Tests

- `src/api/__tests__/storylines.test.ts` — client paths/methods/bodies.
- `src/stores/__tests__/storylines.test.ts` — unread math, optimistic
  read-marking + rollback, chapter cache, job tracking.
- `src/components/storylines/__tests__/` — `ChapterToc`, `ChapterReader`
  (visibility, menu, rename), `DraftBlock`.
- `src/views/__tests__/StorylineDetailView.test.ts` — reader assembly,
  mark-read-on-visible, unpublish confirm, TOC scroll.
- `src/views/__tests__/StorylineListView.test.ts` — badges, sorting, delete.
