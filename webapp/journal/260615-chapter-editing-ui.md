# 260615 — Chapter editing UI

Shipped the manual chapter-editing surface for `StorylineDetailView`. Users can
now restructure a storyline's chapter set entirely from the detail view's left
chapter rail without leaving the page.

## What shipped

**Add chapter button.** A `+ Add chapter` button at the top of the rail opens a
date modal. The user supplies a start date; the server closes the current open
chapter at that date and opens a new one, auto-queuing regeneration for both.

**Per-chapter ⋯ menu.** Each rail item gets a `ChapterEditMenu` component — a
`⋯` toggle that opens a small dropdown with four actions:

- **Edit dates** — date-range modal; updates the chapter's `start_date` /
  `end_date` and ripples the touching neighbor's boundary (server default,
  `allow_gap=false`).
- **Split here** — single-date modal; cuts the chapter at the given date into
  two chapters, each auto-queued for regeneration.
- **Merge with next** — no modal; immediately combines the chapter and its
  successor. Hidden when the chapter has no next sibling.
- **Delete** — confirmation modal with an optional "Leave a gap instead of
  merging into the neighbour" checkbox.

Every structural edit calls the backend and then re-fetches the storyline so
the rail updates immediately; the backend auto-queues per-chapter regeneration
jobs and returns the `job_ids[]` in the response.

## Components added

`src/components/storylines/`

- `ChapterEditMenu.vue` — presentational ⋯ dropdown; emits `edit | split |
  merge | delete` intents. Uses `defineEmits` with a cast to satisfy
  TypeScript's literal-overload requirement.
- `ChapterDateModal.vue` — fixed-position date picker. `showEnd: boolean` prop
  controls whether the end-date field renders; the payload omits absent fields.
- `ChapterConfirmModal.vue` — confirmation dialog for destructive actions.
  `showAllowGap: boolean` prop reveals the gap checkbox; emits
  `{ allow_gap: boolean }` on confirm.

All three components carry `data-test` attributes and are covered by unit tests
in `src/components/storylines/__tests__/`.

## Store actions added (`stores/storylines.ts`)

- `addChapter(storylineId, { start_date, end_date? })` → `ChapterMutationResponse`
- `splitChapter(storylineId, chapterId, date)` → `ChapterMultiMutationResponse`
- `mergeChapters(storylineId, [id, nextId])` → `ChapterMutationResponse`
- `updateChapterDates(storylineId, chapterId, request)` → `ChapterMultiMutationResponse`
- `deleteChapter(storylineId, chapterId, allowGap)` → void

Each action calls the API then calls `loadStoryline(storylineId)` to re-fetch
and update `currentStoryline.chapters` — no local splice, trusts the server as
source of truth.

## API client functions added (`api/storylines.ts`)

- `addChapter` → `POST /api/storylines/{id}/chapters`
- `splitChapter` → `POST /api/storylines/{id}/chapters/{cid}/split`
- `mergeChapters` → `POST /api/storylines/{id}/chapters/merge`
- `updateChapterWindow` → `PATCH /api/storylines/{id}/chapters/{cid}`
- `deleteChapter` → `DELETE /api/storylines/{id}/chapters/{cid}`

## Types added (`types/storyline.ts`)

`ChapterMutationResponse`, `ChapterMultiMutationResponse`, `AddChapterRequest`,
`SplitChapterRequest`, `MergeChaptersRequest`, `UpdateChapterWindowRequest`,
`DeleteChapterRequest`.

## Design decisions

**Inline rail menu rather than a separate manager.** Chapter editing is
contextual to the selected storyline. Keeping the controls on each rail item
means the user can see the chapter list and the reader side-by-side while
restructuring — no context switch to a dedicated editor page.

**Presentational components emitting intents, wired by the view.** The three
new components hold no store state. They receive props and emit events;
`StorylineDetailView.vue` owns `activeModal`, `modalTargetChapter`, and
`chapterActionError`. This makes the components independently testable and keeps
the view as the single point of control.

**`allow_gap` on delete but not yet on edit-dates.** The confirm modal for
Delete exposes the gap checkbox because leaving a gap is the obvious alternative
to absorbing. Edit-dates ripples the neighbor silently (server default) for now;
adding a gap option to the date modal is a follow-up once the UX need is clear.

**Auto-regeneration on every structural edit.** The server queues regeneration
for affected chapters automatically and returns `job_ids[]`. The rail refreshes
via the storyline re-fetch and the panels update when the jobs complete.
Per-chapter job progress is now surfaced in the rail — see follow-up section
below.

## Server-side reference

The backend chapter-edit endpoints are specified in
`server/docs/superpowers/specs/2026-06-13-storyline-chapters-design.md` and
were implemented as part of the same Phase 2 cycle that produced this UI.

## Follow-up: generating state + ranged add (2026-06-15)

Two follow-up enhancements shipped in the same session as the base chapter
editing UI, in commits `29263f7` and `3d7b159`.

**Live per-chapter generating state.** After any structural chapter edit the
store now calls `_trackChapterRegens(storylineId, chapterIds, jobIds)`. This
helper adds the affected chapter ids to a new reactive `generatingChapterIds`
`Ref<Set<number>>` immediately, then watches the returned jobs via
`useJobsStore` — once every job reaches a terminal status the ids are cleared
and the storyline is reloaded. The chapter rail shows a `"generating…"` badge
(`data-test="chapter-generating"`) on each marked item.

The decision to reuse `useJobsStore` rather than a bespoke polling loop was
deliberate: the jobs store already tracks `{ job_id, status }` for the
storyline-level regenerate flow; wiring into the same watcher pattern meant the
per-chapter badge gets all the cancellation and de-duplication logic for free.

**Ranged add-chapter.** `ChapterDateModal` gained an optional `hint` prop (a
helper line below the date fields). The "Add chapter" flow now opens the modal
with `showEnd: true` and the hint: "Leave End blank to start a new open chapter,
or set it to add a chapter over a fixed date range." When end is set, the view
passes `end_date` through to `store.addChapter`; the server creates a closed
chapter over the fixed range instead of opening a new live chapter. Both paths
go through the same `addChapter` action and `_trackChapterRegens` call.
