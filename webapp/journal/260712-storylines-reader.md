# 2026-07-12 — Storylines reader (draft/published redesign, webapp side)

Counterpart of the server-side storylines redesign (see `journal-server`
`journal/260712-storylines-redesign.md` and the spec
`docs/superpowers/specs/2026-07-12-storylines-redesign-design.md`). The
webapp side replaces the two-panel chapter browser with a book-style reader.

## What changed

- **Types/API client** rebuilt for the new wire shapes: chapters carry
  `state ('draft'|'published')`, derived `entry_count`/`first`/`last_entry_date`,
  `published_at`, `read_at`, `addenda`; storyline summaries carry
  `unread_count`/`chapter_count`. New endpoints: refresh, unpublish,
  read/unread. Deleted: regenerate (all forms), chapter add/split/merge/
  window/delete, curation panel types.
- **Store**: `chapterCache` (immutable published chapters make caching
  trivially correct), one `updating` flag tracking `storyline_update` jobs,
  computed `totalUnread`, optimistic `markRead` with rollback.
- **Reader UI**: `ChapterToc` (unread dots) + `ChapterReader` per published
  chapter (narrative + addenda blocks + Rename/Mark-unread/Unpublish menu,
  IntersectionObserver mark-read-on-view) + `DraftBlock` (subdued, Refresh).
  `StorylineNarrative` and its footnote UI survive unchanged as the
  rendering engine.
- **Badges**: unread counts on list rows and the sidebar Storylines link.
- **Deleted**: `StorylineCurationList`, `StorylineRegenerateModal`,
  `ChapterEditMenu`/`ChapterDateModal`/`ChapterConfirmModal`,
  `generatingChapterIds` machinery, curation date-mode toggle, create-modal
  date-range fields.

## Decisions worth remembering

- **Mark-read on 60% visibility**, optimistic with rollback — reading is the
  natural gesture; no explicit "mark read" chore. "Mark unread" stays as the
  escape hatch in the chapter menu.
- **Chapter cache keyed by id, cleared on update-job completion** — published
  chapters are immutable by server contract, so the cache needs no TTL or
  invalidation beyond "an update job ran".
- **One `updating` flag instead of per-chapter generating state** — the
  server serializes storyline work on a single-worker pool, so finer-grained
  client state was fiction.
- `window.confirm` for both storyline delete and chapter unpublish — one
  confirmation pattern everywhere (the old styled modals were deleted with
  the editing surface).

## Post-ship addendum (2026-07-13)

- The end-of-work review caught two Critical store bugs before merge: chapters
  were never re-fetched after a `storyline_update` job completed (the reader
  degraded to permanent skeletons after Refresh/Unpublish/bootstrap), and
  `_applyReadState` double-decremented unread counts because its guard
  compared timestamp values instead of null↔non-null transitions. Fixed in
  `b8cd1d4` with failing-tests-first, plus: job effects scoped to the
  storyline actually on screen, `updating` derived from a job-id set
  (survives `clearCurrent` and overlapping jobs), a viewport-fill visibility
  predicate so tall chapters can be marked read, a `props.id` watch, and
  parallelized chapter loads.
- Merged to main and deployed 2026-07-12 alongside the server.
- Known fast-follows (non-blocking, from re-review): a narrow TOCTOU race if
  an update job completes during an in-flight detail navigation; the shared
  `chapterLoading` flag races under parallel loads (currently unused by UI).
