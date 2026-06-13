# Storyline Chapters — Phase 1 (webapp)

**Date:** 2026-06-13

Webapp side of Storyline Chapters Phase 1 (Tasks 6–9 on `feat/storyline-chapters`).
Pairs with the server-side work and the cross-repo design + Phase 1 plan in the
server repo:

- `../../server/docs/superpowers/specs/2026-06-13-storyline-chapters-design.md`
- `../../server/docs/superpowers/plans/2026-06-13-storyline-chapters-phase1.md`

## What

A storyline is now sliced into **chapters** — time-windowed segments that each
own their own pair of panels (curation + narrative) and are generated
independently. Exactly one chapter is `open` (the live, append-extended slice);
the rest are `closed`. The webapp surfaces this on `/storylines/:id`:

- **Types** (`src/types/storyline.ts`): `StorylineChapterSummary` (id, seq,
  title, date window, `state`, `last_generated_at`, aggregate
  `citation_count`), `StorylineChapterDetail` (summary + a `panels` map keyed by
  panel kind), and `RenameChapterRequest`. `StorylineDetail` gained
  `chapters: StorylineChapterSummary[]`.
- **API client** (`src/api/storylines.ts`): `fetchStorylineChapter`,
  `regenerateStorylineChapter`, `renameStorylineChapter` —
  `GET` / `POST .../regenerate` / `PATCH` on
  `/api/storylines/{id}/chapters/{cid}`.
- **Store** (`src/stores/storylines.ts`): `currentChapter` + `chapterLoading`
  state; `loadChapter` / `regenerateChapter` / `renameChapter` actions;
  `clearCurrent()` now also clears the chapter state.
- **View** (`src/views/StorylineDetailView.vue`): a **left chapter rail**
  (Layout A). Clicking a chapter lazy-loads its panels via `loadChapter`; the
  existing two-panel Curated | Narrative reader renders that chapter. The latest
  (open) chapter is selected by default; selection is deep-linkable via
  `?chapter=<id>`. Citation numbering is built from the current chapter's
  panels, so it restarts at `[1]` per chapter.

## Decisions

1. **Layout A — left chapter rail.** The rail sits to the left of the reader
   (`md:flex-row`, rail stacks above the reader below 768px), listing chapters
   in `seq` order with title (fallback `Chapter {seq}`), date window, and an
   open/closed dot. Keeps the familiar two-panel reader intact and adds chapter
   navigation alongside it rather than nesting tabs inside the panels.

2. **Per-chapter lazy load.** The storyline detail fetch carries only chapter
   *summaries*, not every chapter's panel bodies. Selecting a chapter calls
   `store.loadChapter` → `GET .../chapters/{cid}`, which loads that one
   chapter's `StorylineChapterDetail` into `currentChapter`. A dedicated
   `chapterLoading` flag drives the reader's own skeleton without touching the
   storyline-level `detailLoading` spinner. This keeps the detail payload small
   as chapter counts grow.

3. **Deep-linkable selection.** On mount the view honours a valid `?chapter=<id>`
   query (if it matches a real chapter), else defaults to the last/highest-seq
   (open) chapter. `selectChapter` writes `?chapter=<id>` back via
   `router.replace`, preserving other query params, so reloads and shared links
   restore the same chapter.

4. **Per-chapter citation reset.** The citation registry
   (`buildCitationRegistry`) is built from `currentChapter.panels`, so `[N]`
   numbering restarts at `[1]` for each chapter instead of running continuously
   across the whole storyline. Each chapter reads as a self-contained unit.

5. **Regenerate stays storyline-level for Phase 1.** The header **Regenerate**
   button is deliberately kept at the storyline level — it delegates to the open
   chapter server-side via the existing regenerate flow. The store + client have
   `regenerateChapter` / `renameChapter` in place, but there is no per-chapter
   Regenerate/rename UI wired up yet. Keeps the Phase 1 surface small while the
   plumbing is ready for Phase 2.

6. **Supersede the back-compat panels shim.** The server still returns a
   storyline-level `panels` field on `StorylineDetail` (= the open chapter's
   panels) for back-compat. The webapp now reads panels **only** from the
   per-chapter endpoint (`currentChapter.panels`), so that shim is unused on the
   detail view and is slated for removal in Phase 2.

## Phase 1 / Phase 2 split

- **Phase 1 (this cycle):** read-only chapter navigation — the rail, per-chapter
  lazy panel load, deep-linking, and per-chapter citation numbering. The
  storyline-level Regenerate button is retained.
- **Phase 2 (deferred):** chapter *authoring* — the LLM "suggest a cut"
  boundary engine and a draggable timeline editor to create/cut chapters, a
  per-chapter Regenerate/rename UI, and removal of the back-compat
  storyline-level `panels` shim. Rationale lives in the server-repo design +
  plan docs linked above.
