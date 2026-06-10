# Storylines (webapp)

**Status:** active reference. **Last updated:** 2026-06-10 (anchor-edit UX shipped on the detail view).

The webapp surface for the storylines feature. A storyline is a cross-entry
narrative anchored on **one or more entities** (1..15; the multi-anchor cycle
shipped 2026-05-12 and is verified end-to-end in the browser). Two parallel
panels — **curation** (verbatim entry excerpts with Haiku-generated
transitions) and **narrative** (third-person prose grounded via the Anthropic
Citations API) — are persisted server-side as `Segment[]`. The curation panel renders as a chronological list of rows; the
narrative panel renders as prose with a footnote-style "Sources" section
beneath. Citations share a single `[N]` numbering scheme across both panels.

The server-side reference is in
[`../../server/docs/storylines.md`](../../server/docs/storylines.md). This
doc describes only the webapp.

## Routes

- `/storylines` — paginated list mirroring `EntryListView.vue`. Sort by name,
  anchors (by first anchor's canonical name — deterministic since the server
  returns anchors sorted by id ASC), last generated, or created. Each row
  renders its anchors as a row of clickable violet-pill chips linking to
  each entity. Header has a **New storyline** button that opens
  `StorylineCreateModal`; rows carry per-row Delete and Regenerate
  affordances; multi-select with a violet selection toolbar offers bulk
  Delete and Regenerate (pattern copied from `EntityListView.vue`).
- `/storylines/:id` — detail view with the two-panel layout. Stacks on
  mobile; at `lg` (1024px) narrative sits on the left, curation on the
  right (swapped 2026-05-12). The header carries Regenerate + Delete
  affordances plus the anchor chips (one violet-pill `RouterLink` per
  anchor, each navigating to the entity).

## Files

```
src/
  types/storyline.ts                    — wire types: Segment, StorylineSummary, StorylineDetail,
                                          CreateStorylineResponse, RegenerateStorylineRequest
  api/storylines.ts                     — list / get / create / regenerate / delete
  stores/storylines.ts                  — Pinia store with `loading` + `detailLoading` split
  composables/useCitationRegistry.ts    — shared [N] numbering across both panels
  components/StorylineNarrative.vue     — narrative panel: prose body + footnotes
  components/StorylineCurationList.vue  — curation panel: row list (date column left-aligned)
  components/StorylineCreateModal.vue   — multi-select entity picker (1..15 anchors) + name + optional date range
  components/StorylineRegenerateModal.vue — Replace / Append-update + optional date range
  components/StorylineAnchorEditor.vue  — inline anchor editor: picker + diff + stale-panels confirm
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

Narrative drives numbering, so narrative footnotes read `[1] [2] [3] …`
in sequence. Curation rows may show non-sequential `[N]` — a row whose
entry is also cited by the narrative inherits the narrative's number,
while curation-only entries pick up trailing numbers. The chronological
row order is what carries the reading flow; `[N]` is a secondary
identifier.

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
   in server `api/ingestion.py::set_storyline_anchors`; the endpoint
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

(The former follow-up 4, **Anchor edit UX**, shipped 2026-06-10 — see
"Anchor editing" above.)

Tracked alongside `../../server/docs/archive/storylines-plan.md` (closed 2026-05-12).
