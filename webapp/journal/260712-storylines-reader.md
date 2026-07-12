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
