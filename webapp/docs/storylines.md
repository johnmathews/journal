# Storylines (webapp)

**Status:** active reference. **Last updated:** 2026-06-15 (Chapter editing UI + live generating state + ranged add-chapter).

The webapp surface for the storylines feature. A storyline is a cross-entry
narrative anchored on **one or more entities** (1..15; the multi-anchor cycle
shipped 2026-05-12 and is verified end-to-end in the browser). As of the
Chapters Phase 1 cycle a storyline is sliced into **chapters** — time-windowed
segments that each own their own pair of panels and are generated
independently (see [Chapters](#chapters-phase-1) below). Each chapter has two
parallel panels — **curation** (verbatim entry excerpts with Haiku-generated
transitions) and **narrative** (third-person prose grounded via the Anthropic
Citations API) — persisted server-side as `Segment[]`. The curation panel
renders as a chronological list of rows; the narrative panel renders as prose
with a footnote-style "Sources" section beneath. Citations share a single
`[N]` numbering scheme across both panels of a chapter, restarting at `[1]`
per chapter.

The server-side reference is in
[`../../server/docs/storylines.md`](../../server/docs/storylines.md). This
doc describes only the webapp.

**See also** — the cross-repo design and the Phase 1 / Phase 2 split (rationale
plus what is deliberately deferred) live in the server repo:
[`../../server/docs/superpowers/specs/2026-06-13-storyline-chapters-design.md`](../../server/docs/superpowers/specs/2026-06-13-storyline-chapters-design.md)
and
[`../../server/docs/superpowers/plans/2026-06-13-storyline-chapters-phase1.md`](../../server/docs/superpowers/plans/2026-06-13-storyline-chapters-phase1.md).

## Routes

- `/storylines` — paginated list mirroring `EntryListView.vue`. Sort by name,
  anchors (by first anchor's canonical name — deterministic since the server
  returns anchors sorted by id ASC), last generated, or created. Each row
  renders its anchors as a row of clickable violet-pill chips linking to
  each entity. Header has a **New storyline** button that opens
  `StorylineCreateModal`; rows carry per-row Delete and Regenerate
  affordances; multi-select with a violet selection toolbar offers bulk
  Delete and Regenerate (pattern copied from `EntityListView.vue`).
- `/storylines/:id` — detail view. A **left chapter rail** (Layout A) lists
  the storyline's chapters; selecting one lazy-loads that chapter's panels into
  the two-panel reader on the right. The reader stacks on mobile; at `lg`
  (1024px) narrative sits on the left, curation on the right (swapped
  2026-05-12). The rail itself stacks above the reader below `md` (768px). The
  selected chapter is deep-linkable via `?chapter=<id>` (see
  [Chapters](#chapters-phase-1)). The header carries Regenerate + Delete
  affordances plus the anchor chips (one violet-pill `RouterLink` per
  anchor, each navigating to the entity). The title is inline-editable:
  a pencil affordance next to the heading swaps it for an input +
  Save/Cancel, persisting via `PATCH /api/storylines/{id}` (store
  `renameStoryline`). Renaming is metadata-only — it never touches the
  panels — so it pairs naturally with anchor edits without forcing a
  regeneration.

## Files

```
src/
  types/storyline.ts                    — wire types: Segment, StorylineSummary, StorylineDetail,
                                          StorylineChapterSummary, StorylineChapterDetail,
                                          RenameChapterRequest, CreateStorylineResponse,
                                          RegenerateStorylineRequest; chapter-edit types:
                                          ChapterMutationResponse, ChapterMultiMutationResponse,
                                          AddChapterRequest, SplitChapterRequest,
                                          MergeChaptersRequest, UpdateChapterWindowRequest,
                                          DeleteChapterRequest
  api/storylines.ts                     — list / get / create / regenerate / delete +
                                          per-chapter get / regenerate / rename +
                                          addChapter / splitChapter / mergeChapters /
                                          updateChapterWindow / deleteChapter
  stores/storylines.ts                  — Pinia store with `loading` + `detailLoading` split,
                                          plus `currentChapter` + `chapterLoading`; chapter-edit
                                          actions: addChapter, splitChapter, mergeChapters,
                                          updateChapterDates, deleteChapter
  composables/useCitationRegistry.ts    — shared [N] numbering across both panels of a chapter
  components/StorylineNarrative.vue     — narrative panel: prose body + footnotes
  components/StorylineCurationList.vue  — curation panel: row list (date column left-aligned)
  components/StorylineCreateModal.vue   — multi-select entity picker (1..15 anchors) + name + optional date range
  components/StorylineRegenerateModal.vue — Replace / Append-update + optional date range
  components/StorylineAnchorEditor.vue  — inline anchor editor: picker + diff + stale-panels confirm
  components/storylines/ChapterEditMenu.vue   — per-chapter ⋯ dropdown: Edit dates / Split here /
                                                Merge with next (hidden when no next) / Delete
  components/storylines/ChapterDateModal.vue  — date-picker modal used by Add, Edit, and Split
                                                actions; `showEnd` prop controls whether the end-date
                                                field is rendered; optional `hint` prop renders a
                                                helper line below the date fields
  components/storylines/ChapterConfirmModal.vue — confirmation modal for destructive actions (delete,
                                                  merge); `showAllowGap` prop reveals the
                                                  "Leave a gap" checkbox
  views/StorylineListView.vue
  views/StorylineDetailView.vue
```

## Panel renderers

The two panels render with separate, specialised components. There is no
markdown on the wire and no markdown library in the webapp.

**Narrative** (`StorylineNarrative.vue`) renders the `Segment[]` as prose:
text segments become plain spans, citation segments become `<sup>[N]</sup>`
markers. A "Sources" section below the body lists each unique cited entry
once with its quote, an `entry #N` RouterLink to `/entries/{id}`, and a
small backref `↩` that scrolls back to the first `[N]` marker in the body.
Clicking `[N]` smooth-scrolls to the matching footnote; clicking the
backref smooth-scrolls back. Inline italic quotes are **not** rendered in
the body — they live only in the Sources section so the narrative reads
like prose.

**Curation** (`StorylineCurationList.vue`) renders the `Segment[]` as a
list of rows, one per citation. Each row pairs the text segment
immediately preceding the citation (used as the date label, with trailing
`:` and whitespace stripped) with the cited quote and a RouterLink to the
source entry. Rows render in chronological encounter order; a CSS grid
layout puts the date label on the left and the entry link on the right,
collapsing to a stacked layout below 640px.

## Shared citation numbering

`buildCitationRegistry(panels)` in `composables/useCitationRegistry.ts`
builds a `Map<entry_id, number>` shared across both panels. It walks the
narrative panel first, then the curation panel, assigning each unique
`entry_id` an incrementing `[N]` in encounter order. The shared registry
guarantees that the same source entry carries the same `[N]` everywhere
it appears.

The detail view builds the registry from **the currently-selected
chapter's** `panels` map (`store.currentChapter?.panels`), so numbering
restarts at `[1]` whenever the user switches chapters — each chapter reads
as a self-contained unit.

Narrative drives numbering, so narrative footnotes read `[1] [2] [3] …`
in sequence. Curation rows may show non-sequential `[N]` — a row whose
entry is also cited by the narrative inherits the narrative's number,
while curation-only entries pick up trailing numbers. The chronological
row order is what carries the reading flow; `[N]` is a secondary
identifier.

## Chapters

A storyline is sliced into **chapters** — time-windowed segments that each own
their own pair of panels and are generated independently. Exactly one chapter
per storyline is `open` (the live, append-extended slice); the rest are
`closed`. `GET /api/storylines/{id}` returns the chapters as
`StorylineChapterSummary[]` on `StorylineDetail.chapters` (in `seq` order);
each summary carries `id`, `seq`, `title`, `start_date`/`end_date`, `state`
(`'open' | 'closed'`), `last_generated_at`, and an aggregate `citation_count`.

**Left rail + per-chapter lazy load.** `StorylineDetailView.vue` renders the
chapters as a left rail (Layout A). The rail item shows the chapter title
(falling back to `Chapter {seq}`), its date window, and an open/closed dot. The
storyline detail fetch does **not** include panel bodies for every chapter;
selecting a chapter calls `store.loadChapter(storylineId, chapterId)`, which
fetches `GET /api/storylines/{id}/chapters/{cid}` and loads that chapter's
`StorylineChapterDetail` (summary fields plus a `panels` map keyed by panel
kind) into `store.currentChapter`. A dedicated `chapterLoading` flag drives the
reader's own "Loading chapter…" skeleton without disturbing the storyline-level
`detailLoading` spinner. The two-panel reader binds its `curation` / `narrative`
panels from `store.currentChapter.panels`.

**Default selection + deep-linking.** On mount the view selects a chapter in
this order: a valid `?chapter=<id>` query param if it matches a real chapter,
otherwise the **latest** chapter (the last element, since chapters are `seq`
ascending — i.e. the open one). `selectChapter` writes `?chapter=<id>` back via
`router.replace` (preserving other query params), so a reload or shared link
restores the same chapter.

**Per-chapter citation reset.** Because the citation registry is built from the
current chapter's panels (see [Shared citation numbering](#shared-citation-numbering)),
`[N]` numbering restarts at `[1]` for each chapter rather than running
continuously across the whole storyline.

**Store state** (on `useStorylinesStore`):

- `generatingChapterIds` — reactive `Ref<Set<number>>` tracking chapter ids
  whose auto-queued regeneration jobs are currently in-flight. Templates call
  `.has(ch.id)` to conditionally show a "generating…" badge. The set is
  populated immediately after each structural edit and cleared (plus the
  storyline is reloaded) once every job in the returned `job_ids[]` reaches a
  terminal status. Implemented via `_trackChapterRegens`, which calls
  `useJobsStore().trackJob(...)` per job and watches their statuses.

**Store actions** (all on `useStorylinesStore`):

- `loadChapter(storylineId, chapterId)` — fetch a chapter's detail into
  `currentChapter`; toggles `chapterLoading`, errors land in the shared `error`
  ref.
- `regenerateChapter(storylineId, chapterId)` — queue a single chapter's
  regeneration (`POST .../chapters/{cid}/regenerate`); reuses the shared
  `regenerating` / `regenerateError` flags and returns the `{ job_id }` response.
- `renameChapter(storylineId, chapterId, title)` — `PATCH .../chapters/{cid}`;
  the server trims the title and returns the authoritative summary, which the
  store writes back onto the matching `currentStoryline.chapters` entry and the
  loaded `currentChapter`.
- `addChapter(storylineId, { start_date, end_date? })` — `POST .../chapters`;
  calls the API then re-fetches the storyline so the rail refreshes.
- `splitChapter(storylineId, chapterId, date)` — `POST .../chapters/{cid}/split`;
  re-fetches the storyline after.
- `mergeChapters(storylineId, [chapterId, nextId])` — `POST .../chapters/merge`;
  re-fetches the storyline after.
- `updateChapterDates(storylineId, chapterId, { start_date?, end_date?, allow_gap? })`
  — `PATCH .../chapters/{cid}`; re-fetches the storyline after.
- `deleteChapter(storylineId, chapterId, allowGap)` — `DELETE .../chapters/{cid}`;
  re-fetches the storyline after.
- `clearCurrent()` also clears `currentChapter` and `chapterLoading`, so
  navigating between storylines does not leak a previous chapter's panels.

**API client** (`api/storylines.ts`):

- `fetchStorylineChapter(storylineId, chapterId)` → `StorylineChapterDetail` —
  `GET /api/storylines/{id}/chapters/{cid}`.
- `regenerateStorylineChapter(storylineId, chapterId)` →
  `RegenerateStorylineResponse` — `POST /api/storylines/{id}/chapters/{cid}/regenerate`.
- `renameStorylineChapter(storylineId, chapterId, { title })` →
  `StorylineChapterSummary` — `PATCH /api/storylines/{id}/chapters/{cid}`.
- `addChapter(storylineId, { start_date, end_date? })` →
  `ChapterMutationResponse` — `POST /api/storylines/{id}/chapters`.
- `splitChapter(storylineId, chapterId, { date })` →
  `ChapterMultiMutationResponse` — `POST /api/storylines/{id}/chapters/{cid}/split`.
- `mergeChapters(storylineId, { chapter_ids })` →
  `ChapterMutationResponse` — `POST /api/storylines/{id}/chapters/merge`.
- `updateChapterWindow(storylineId, chapterId, { start_date?, end_date?, allow_gap? })` →
  `ChapterMultiMutationResponse` — `PATCH /api/storylines/{id}/chapters/{cid}`.
- `deleteChapter(storylineId, chapterId, { allow_gap? })` →
  `{ deleted: boolean; job_ids: string[] }` — `DELETE /api/storylines/{id}/chapters/{cid}`.

**Chapter editing UI (shipped 2026-06-15).** The left chapter rail now carries
two surfaces for structural edits — see [Chapter editing](#chapter-editing) below
for the full description. The header **Regenerate** button is kept at the
**storyline level** — it delegates to the open chapter server-side. The server
still returns a back-compat storyline-level `panels` field on `StorylineDetail`
(equal to the open chapter's panels); the webapp reads panels exclusively from
the per-chapter endpoint, so that shim is unused and will be removed in a
follow-up.

## Chapter editing

The detail view's left chapter rail exposes two surfaces for structural edits:

**Add chapter button.** A `+ Add chapter` button sits at the top of the rail.
Clicking it opens `ChapterDateModal` with `showEnd: true` and a contextual hint
line: "Leave End blank to start a new open chapter, or set it to add a chapter
over a fixed date range." Two behaviours depending on what the user provides:

- **End blank (new open chapter):** the user supplies only a `start_date`; the
  server closes the currently-open chapter at that date and opens a new one
  starting there, auto-queuing regeneration for both.
- **End set (closed chapter over a fixed range):** the user supplies both
  `start_date` and `end_date`; the server inserts a closed chapter over that
  range, auto-queuing regeneration for the new chapter.

In both cases the store's `addChapter` action re-fetches the storyline so the
rail refreshes, and `_trackChapterRegens` marks the affected chapter ids in
`generatingChapterIds`.

**Per-chapter ⋯ menu.** Each rail item carries a `ChapterEditMenu` component
that renders a `⋯` toggle button opening a small dropdown. The menu is
presentational: it emits one of four intents (`edit`, `split`, `merge`,
`delete`); the view wires each to its handler. "Merge with next" is hidden
(`v-if="hasNext"`) when the chapter has no successor.

The four operations:

- **Edit dates** — opens `ChapterDateModal` with `showEnd: true` and the
  chapter's current `start_date` / `end_date` pre-filled. On submit the view
  calls `store.updateChapterDates(...)`. The server adjusts the touching
  neighbor's boundary to avoid overlap unless the `allow_gap` flag is set (not
  currently exposed in the date modal — the server default is false, meaning the
  neighbor is rippled). Returns `ChapterMultiMutationResponse` (the affected
  chapters) and `job_ids[]`.

- **Split here** — opens `ChapterDateModal` with `showEnd: false`, title "Split
  chapter". The user picks the date at which to cut the chapter into two. On
  submit the view calls `store.splitChapter(storylineId, chapterId, date)`.
  Returns `ChapterMultiMutationResponse` and `job_ids[]` for both new chapters.

- **Merge with next** — no modal; the view immediately calls
  `store.mergeChapters(storylineId, [ch.id, next.id])`, combining the selected
  chapter and its successor into one. Returns `ChapterMutationResponse` and
  `job_ids[]` for the merged chapter.

- **Delete** — opens `ChapterConfirmModal` with `showAllowGap: true`. The
  confirm modal presents an optional "Leave a gap instead of merging into the
  neighbour" checkbox. On confirm the view calls
  `store.deleteChapter(storylineId, chapterId, allow_gap)`. Without the gap
  flag the server absorbs the deleted chapter's date range into the previous
  neighbor; with the flag it leaves a gap. Returns `{ deleted, job_ids[] }`.

**Auto-regeneration and live generating state.** Every structural edit returns
`job_ids[]` (an array of background-job ids the server has auto-queued for the
affected chapters' regeneration). The store re-fetches the whole storyline after
each edit so the rail reflects the new chapter set immediately, then calls
`_trackChapterRegens` to:

1. Add the affected chapter ids to `generatingChapterIds` — the rail renders a
   `"generating…"` badge (`data-test="chapter-generating"`) on each marked item.
2. Register each job via `useJobsStore().trackJob(...)`.
3. Watch job statuses — once all returned jobs reach a terminal state
   (`succeeded` or `failed`), the chapter ids are removed from
   `generatingChapterIds` and the storyline is reloaded to surface fresh panels.

**Component design.** `ChapterEditMenu`, `ChapterDateModal`, and
`ChapterConfirmModal` are purely presentational (no store imports). They receive
props and emit intent events; `StorylineDetailView.vue` holds all mutable state
(`activeModal`, `modalTargetChapter`, `chapterActionError`) and handles every
intent. This keeps the components thin and independently testable.

## Regenerate flow

`POST /api/storylines/{id}/regenerate` accepts an optional JSON body
`{start_date?, end_date?, mode?}`. The detail-view "Regenerate" button
posts with no body (server default = full window, replace). The list
view's per-row and bulk Regenerate actions open
`StorylineRegenerateModal`, which lets the user pick **Replace** (the
default) or **Append-update**, and optionally narrow the date window.
Append-mode requires a `start_date` (validated client-side before
submit) — the server then validates `start_date >= last_generated_at`
and surfaces a 400 if violated.

The response returns 202 with `{job_id}`. The detail view registers
the job via `useJobsStore().trackJob(jobId, 'storyline_generation',
{ storyline_id })`. When the job reaches a terminal state (`succeeded`
/ `failed`), a watcher re-fetches the detail so the freshly-persisted
panels show up. On failure, the regenerate-error banner surfaces the
server message; the toast confirmation handles the happy path.

## Create flow

`POST /api/storylines` takes `entity_ids: number[]` and returns 201 with the
storyline body (including `anchors: { id, canonical_name }[]`) plus
`generation_job_id`. The list-view "New storyline" button opens
`StorylineCreateModal` — debounced entity search, **multi-select picker**:
picked entities show as removable chips above the search box, and the
search results list toggles membership on click (✓ when picked). Auto-name
reads as "X" / "X and Y" / "X, Y, and Z" until the user overrides it (user
override preserved via a `nameDirty` flag). A soft cap of 15 anchors is
enforced client-side (input disables with a cap-reached message);
`MAX_ANCHORS = 15` is duplicated as a client constant — the server stays
the source of truth and rejects above-cap requests with 422, but the
client cap saves a round-trip. Optional description / date range fields
unchanged. On submit, the modal closes, a toast fires ("Storyline created.
Generating panels…"), and the returned `generation_job_id` is tracked
through `useJobsStore` so the list reloads on completion.

## Anchor editing (shipped 2026-06-10)

The detail view's anchor chips carry an **Edit anchors** toggle that opens
`StorylineAnchorEditor` inline below the meta strip. The editor seeds its
selection from the saved anchors and reuses the multi-select picker pattern
from `StorylineCreateModal` (debounced entity search, removable chips,
toggle-on-click results, client-side `MAX_ANCHORS = 15` cap — the constant
now lives once in `types/storyline.ts` and is shared by both components).

The three design questions this feature had open were resolved as follows
(rationale also recorded in `StorylineAnchorEditor.vue` and
`journal/260610-anchor-edit-ux.md`):

1. **Inline panel, not a modal.** Editing anchors is contextual to the
   detail view — keeping the current panels visible while editing lets
   the user see exactly what a regeneration would replace.
2. **Diff-vs-current display.** The chips row shows the *proposed* set; a
   separate diff summary ("Adding" green chips / "Removing" red chips)
   appears as soon as the selection diverges from the saved set. Save
   stays disabled until there is a non-empty diff and at least one anchor
   remains.
3. **Confirm-before-stale-panels, no auto-kick.** The server's
   `PUT /api/storylines/{id}/anchors` only replaces the anchor rows — it
   does **not** touch the stored panels or queue a regeneration (verified
   in server `api/storylines_write.py::set_storyline_anchors`; the endpoint
   dedupes + id-sorts the ids and returns the authoritative `anchors`
   list, which the store uses to refresh state). Clicking **Save changes**
   therefore opens a confirm step warning that the panels go stale, with
   **Save & regenerate** (PUT, then the detail view chains its existing
   regenerate flow — one job, with the usual tracking + auto-refresh) and
   **Save only** (panels stay stale until a manual Regenerate). We
   deliberately do not auto-kick regeneration on save: it costs LLM
   tokens, and a user reshaping a storyline may want to batch several
   anchor edits before paying for one regeneration.

Store-side, `useStorylinesStore().setAnchors(id, entityIds)` wraps the PUT
with `savingAnchors` / `anchorsError` state and refreshes both
`currentStoryline.anchors` and any matching list row from the response.
The same endpoint remains available to Claude via the
`journal_set_storyline_anchors` MCP tool.

## Follow-ups

1. **Entity backfill.** Server-side — `journal extract-entities
--stale-only` could reduce dependence on the FTS fallback for the
   seeded storylines and tighten the curation panel's signal-to-noise.
2. **Hover preview of footnotes.** Webapp-side — augment `[N]` markers
   with a hover/tap tooltip showing the quote, so readers can dip into
   sources without losing place. Layered on top of the existing
   smooth-scroll behaviour.
3. **Narrative prompt tuning.** Server-side — if stripping inline
   quotes from the body leaves prose with occasional awkward seams
   (e.g. sentences originally written assuming a quote would follow),
   tune the narrator prompt to produce footnote-style output natively.
4. **Allow-gap in Edit-dates modal.** The `allow_gap` flag exists in the
   server API (`UpdateChapterWindowRequest`) but is not yet exposed in the
   `ChapterDateModal` UI — the server always ripples the neighbor. Adding a
   checkbox (matching the Delete modal) would give users full control.
5. **Back-compat panels shim removal.** `StorylineDetail.panels` (the
   open-chapter shim) is no longer read by the webapp and can be dropped
   from the server's `GET /api/storylines/{id}` response in a follow-up.

(Former follow-up 4, **Anchor edit UX**, shipped 2026-06-10 — see "Anchor
editing" above. Former Phase 2 **chapter editing UI** shipped 2026-06-15 — see
"Chapter editing" above.)

Tracked alongside `../../server/docs/archive/storylines-plan.md` (closed 2026-05-12).
