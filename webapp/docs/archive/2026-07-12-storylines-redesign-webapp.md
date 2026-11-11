# Storylines Redesign (Webapp) Implementation Plan

**Status:** closed 2026-07-12 — executed (lean mode), merged to main (b8cd1d4), deployed. Current reference: [`../../storylines.md`](../../storylines.md). The server plan referenced below is archived at `journal-server` `docs/archive/2026-07-12-storylines-redesign-server.md`.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the storylines UI for the draft/published chapter model: a vertical book-style reader with unread badges, replacing the two-panel layout and all chapter-window editing. Spec: `../../../server/docs/superpowers/specs/2026-07-12-storylines-redesign-design.md` §5; server API from the sibling plan `journal-server` `docs/superpowers/plans/2026-07-12-storylines-redesign-server.md` Task 9.

**Architecture:** Types/API client reshape first, then the Pinia store, then views. Published chapters render as immutable book chapters with the existing footnote/citation UI; the single draft renders last, subdued. Read-state syncs on view. Curation panel, date-mode toggle, and chapter-editing modals are deleted.

**Tech Stack:** Vue 3.5 script-setup + TS, Pinia, Vitest + Vue Test Utils + happy-dom, Tailwind CSS 4.

## Global Constraints

- **Do not start until the server plan's Task 9 (REST surface) is merged** — the dev proxy must serve the new shapes.
- Coverage thresholds (85% statements/branches/functions/lines) enforced by pre-push; every task adds tests with its code.
- `npm run test:coverage` (not `test:unit`) before every push; watch CI after pushing (house rules).
- Palette: `violet-*`/`gray-*` (the review flagged the old chapter modals' `slate/indigo` drift — do not reintroduce it).
- Commit after every task.

---

### Task 1: Types + API client

**Files:**
- Rewrite: `src/types/storyline.ts`
- Rewrite: `src/api/storylines.ts`
- Test: `src/api/__tests__/storylines.spec.ts` (follow the existing api-client test pattern in that directory)

**Interfaces (produced — later tasks import these exact names):**

```typescript
// types/storyline.ts
export type Segment =
  | { kind: 'text'; text: string }
  | { kind: 'citation'; entry_id: number; quote: string; entry_date?: string }

export interface StorylineAnchor { entity_id: number; canonical_name: string }

export interface StorylineSummary {
  id: number; name: string; description: string; status: 'active' | 'archived'
  anchors: StorylineAnchor[]
  unread_count: number
  chapter_count: number
  created_at: string; updated_at: string
}

export interface ChapterMeta {
  id: number; seq: number; title: string
  state: 'draft' | 'published'
  entry_count: number
  first_entry_date: string | null; last_entry_date: string | null
  published_at: string | null; read_at: string | null
  citation_count: number
}

export interface Addendum { added_at: string; segments: Segment[]; entry_ids: number[] }

export interface ChapterDetail extends ChapterMeta {
  segments: Segment[]; addenda: Addendum[]; model_used: string; generated_at: string | null
}

export interface StorylineDetail extends StorylineSummary { chapters: ChapterMeta[] }

export const MAX_ANCHORS = 15
```

```typescript
// api/storylines.ts — all via the existing apiFetch wrapper
fetchStorylines(): Promise<StorylineSummary[]>
fetchStoryline(id: number): Promise<StorylineDetail>
fetchChapter(storylineId: number, chapterId: number): Promise<ChapterDetail>
createStoryline(body: CreateStorylineRequest): Promise<{ storyline: StorylineDetail; bootstrap_job_id: string }>
updateStoryline(id, body), deleteStoryline(id), setStorylineAnchors(id, entityIds)  // unchanged shapes
refreshStoryline(id: number): Promise<{ job_id: string }>
markChapterRead(storylineId: number, chapterId: number): Promise<ChapterMeta>
markChapterUnread(storylineId: number, chapterId: number): Promise<ChapterMeta>
renameChapter(storylineId: number, chapterId: number, title: string): Promise<ChapterMeta>
unpublishNewest(storylineId: number): Promise<{ job_id: string }>
```

Deleted exports: `StorylinePanel`, curation types, `regenerateStoryline`, `regenerateStorylineChapter`, `addChapter`, `splitChapter`, `mergeChapters`, `updateChapterWindow`, `deleteChapter`, and their request/response types.

- [ ] **Step 1: Write the failing test** — for each new client function, assert method + path + body against the mocked `apiFetch` (copy the arrange/assert style of the existing storylines client spec; e.g. `markChapterRead` → `POST /api/storylines/3/chapters/9/read`).
- [ ] **Step 2: Run to verify failure** — `npm run test:unit -- storylines.spec` — FAIL.
- [ ] **Step 3: Implement** types + client exactly as the Interfaces block.
- [ ] **Step 4: Run** — PASS. (Store/view specs now fail to compile — expected until Tasks 2–4.)
- [ ] **Step 5: Commit** — `git add -A src/types src/api && git commit -m "feat(storylines): types + API client for draft/published model"`

---

### Task 2: Store rewrite

**Files:**
- Rewrite: `src/stores/storylines.ts`
- Test: rewrite `src/stores/__tests__/storylines.spec.ts`

**Interfaces (produced):**

```typescript
export const useStorylinesStore = defineStore('storylines', () => {
  // state
  storylines: Ref<StorylineSummary[]>
  currentStoryline: Ref<StorylineDetail | null>
  chapterCache: Ref<Map<number, ChapterDetail>>       // by chapter id, per current storyline
  loading / detailLoading / chapterLoading: Ref<boolean>
  updating: Ref<boolean>                              // one flag; replaces generatingChapterIds
  error refs per action (loadError, actionError)
  totalUnread: ComputedRef<number>                    // sum of unread_count — sidebar badge
  // actions
  loadStorylines(): Promise<void>
  loadStoryline(id: number): Promise<void>
  loadChapter(storylineId: number, chapterId: number): Promise<ChapterDetail | null>
  create(body): Promise<StorylineSummary | null>      // tracks bootstrap job via useJobsStore
  refresh(id): Promise<void>                          // tracks job; sets updating
  markRead(storylineId, chapterId): Promise<void>     // optimistic: clears read_at locally first
  markUnread(storylineId, chapterId): Promise<void>
  rename(storylineId, chapterId, title): Promise<void>
  unpublishNewest(storylineId): Promise<void>         // tracks job; reloads detail on completion
  remove(id), saveAnchors(id, entityIds), saveName(id, name)  // ported as-is
})
```

Job tracking: keep the `_trackChapterRegens`-style watcher on `useJobsStore` but reduced to one storyline-level `updating` flag cleared (and detail reloaded) when the tracked job reaches a terminal status.

- [ ] **Step 1: Write the failing tests** — port the existing store spec's mock-API scaffolding; cover: `loadStorylines` populates `totalUnread`; `markRead` optimistically decrements `unread_count` on the summary and sets `read_at` on the cached meta, and rolls back on API error; `refresh`/`unpublishNewest` set `updating` until the mocked jobs store reports terminal; `loadChapter` caches by id and skips the fetch on second call.
- [ ] **Step 2: Run to verify failure** — FAIL.
- [ ] **Step 3: Implement** per interfaces; delete all merge/split/window/delete actions and `generatingChapterIds`.
- [ ] **Step 4: Run** — `npm run test:unit -- stores/__tests__/storylines` — PASS.
- [ ] **Step 5: Commit** — `git commit -m "feat(storylines): store — unread state, read actions, single updating flag"`

---

### Task 3: Reader — StorylineDetailView

**Files:**
- Rewrite: `src/views/StorylineDetailView.vue`
- Create: `src/components/storylines/ChapterReader.vue`, `src/components/storylines/ChapterToc.vue`, `src/components/storylines/DraftBlock.vue`
- Keep: `src/components/StorylineNarrative.vue` (rendering engine for segments — reused by ChapterReader for both chapter body and addenda), `src/composables/useCitationRegistry.ts`, `StorylineAnchorEditor.vue`, `StorylineCreateModal.vue`
- Delete: `src/components/StorylineCurationList.vue`, `src/components/StorylineRegenerateModal.vue`, `src/components/storylines/ChapterEditMenu.vue`, `ChapterDateModal.vue`, `ChapterConfirmModal.vue` + their specs
- Test: rewrite `src/views/__tests__/StorylineDetailView.spec.ts`; create specs for the three new components

**Component contracts:**

```
ChapterToc:    props { chapters: ChapterMeta[], activeId: number | null }
               emits { select: [chapterId: number] }
               renders one row per chapter: title (fallback `Chapter ${seq}`),
               date range eyebrow, violet unread dot when published && !read_at,
               subdued "In progress" row for the draft.

ChapterReader: props { chapter: ChapterDetail, storylineId: number }
               emits { visible: [chapterId: number] }   // fires once when scrolled into view
               renders <h2> title, date-range eyebrow, <StorylineNarrative :segments>,
               then each addendum as a bordered "Later:" block with its own
               <StorylineNarrative>, then a footer row: published date +
               kebab menu (Rename / Mark unread / Unpublish — Unpublish only
               on the newest published chapter, passed as a prop `isNewest`).

DraftBlock:    props { chapter: ChapterDetail | null, updating: boolean }
               emits { refresh: [] }
               subdued card: "In progress — N entries", draft narrative if any,
               Refresh button with spinner while updating.
```

View behavior: on mount load detail, then lazily `loadChapter` for each chapter in seq order (published then draft); `visible` events call `store.markRead` for published-unread chapters (IntersectionObserver inside ChapterReader with a 60%-visible threshold; in tests, call the exposed handler directly — happy-dom has no IO, so guard `typeof IntersectionObserver !== 'undefined'`). `?chapter=<id>` scrolls to that chapter. Header keeps: back, editable title, Delete (keep `window.confirm` for storyline delete — one confirm pattern, note in the view docstring), anchors editor toggle.

- [ ] **Step 1: Write the failing tests** — mount with a mocked store: renders one `ChapterReader` per published chapter and one `DraftBlock`; TOC select scrolls (assert `scrollIntoView` spy); `visible` on an unread chapter calls `markRead` once and never for already-read; Unpublish appears only on the newest published chapter and calls `store.unpublishNewest`; deleted components no longer exist (import test).
- [ ] **Step 2: Run to verify failure** — FAIL.
- [ ] **Step 3: Implement** the three components + view rewrite. Reuse `buildCitationRegistry` per chapter (numbering restarts each chapter, as today).
- [ ] **Step 4: Run** — `npm run test:unit -- StorylineDetailView ChapterReader ChapterToc DraftBlock` — PASS.
- [ ] **Step 5: Commit** — `git commit -m "feat(storylines): book-style reader — TOC, chapter readers, draft block"`

---

### Task 4: List view + sidebar unread badges

**Files:**
- Modify: `src/views/StorylineListView.vue` (add unread badge column/chip to table rows and mobile cards; remove per-row Regenerate + bulk Regenerate — Refresh lives on the detail page now; keep Delete)
- Modify: `src/components/layout/AppSidebar.vue:329-372` (violet count pill next to the Storylines link bound to `storylinesStore.totalUnread`, hidden when 0; load summaries lazily on first sidebar render if store empty — follow whatever pattern the sidebar uses for other dynamic items, or skip auto-load and bind only when the store has data: simplest correct option)
- Test: update `StorylineListView` spec; add sidebar badge case to the sidebar spec

- [ ] **Step 1: Write the failing tests** — list row shows `unread_count` chip when > 0, none when 0; sidebar pill renders `totalUnread` and hides at 0; Regenerate buttons gone.
- [ ] **Step 2: Run to verify failure** — FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** — PASS.
- [ ] **Step 5: Commit** — `git commit -m "feat(storylines): unread badges on list + sidebar"`

---

### Task 5: Cleanup, docs, coverage, ship

**Files:**
- Delete: any straggler references (`grep -rn "curation\|CurationList\|splitChapter\|mergeChapters\|updateChapterWindow\|generatingChapterIds" src/`)
- Rewrite: `docs/storylines.md` (reader model, read-state, unpublish; delete the stale chapter-rail description flagged in the 2026-07-12 review); update `docs/architecture.md` storylines mentions
- Create: `journal/260712-storylines-reader.md` (what changed + link to server journal entry)

- [ ] **Step 1: Sweep + docs.**
- [ ] **Step 2: Full verification**

Run: `npm run lint && npm run test:coverage && npm run build`
Expected: green, coverage ≥ 85% on all four metrics.

- [ ] **Step 3: Commit, push, watch CI**

```bash
git add -A
git commit -m "feat(storylines): cleanup + docs for the reader model"
git push && gh run watch
```

Reference the server repo's counterpart commit in the message body per the cross-repo convention.
