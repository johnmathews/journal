# Storylines (webapp)

**Status:** active reference. **Last updated:** 2026-05-12.

The webapp surface for the storylines feature shipped server-side at
`journal-server@8396c7e`. A storyline is a cross-entry narrative anchored on
a single entity. Two parallel panels — **curation** (verbatim entry excerpts
with Haiku-generated transitions) and **narrative** (third-person prose
grounded via the Anthropic Citations API) — are persisted server-side as
`Segment[]`. The curation panel renders as a chronological list of rows; the
narrative panel renders as prose with a footnote-style "Sources" section
beneath. Citations share a single `[N]` numbering scheme across both panels.

The server-side reference is in
[`../../server/docs/storylines.md`](../../server/docs/storylines.md). This
doc describes only the webapp.

## Routes

- `/storylines` — paginated list mirroring `EntryListView.vue`. Sort by name,
  entity, last generated, or created. Empty state nudges you to seed via the
  MCP tools (`journal_create_storyline`) since no create form ships in v1.
- `/storylines/:id` — detail view with the two-panel layout. Stacks on
  mobile, sits side-by-side at `lg` (1024px). Header carries Regenerate +
  Delete affordances.

## Files

```
src/
  types/storyline.ts                    — wire types: Segment, StorylineSummary, StorylineDetail
  api/storylines.ts                     — list / get / create / regenerate / delete
  stores/storylines.ts                  — Pinia store with `loading` + `detailLoading` split
  composables/useCitationRegistry.ts    — shared [N] numbering across both panels
  components/StorylineNarrative.vue     — narrative panel: prose body + footnotes
  components/StorylineCurationList.vue  — curation panel: row list
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

`POST /api/storylines/{id}/regenerate` returns 202 with `{job_id}`. The
detail view registers the job via `useJobsStore().trackJob(jobId,
'storyline_generation', { storyline_id })`. When the job reaches a terminal
state (`succeeded` / `failed`), a watcher re-fetches the detail so the
freshly-persisted panels show up. On failure, the regenerate-error banner
surfaces the server message; the toast confirmation handles the happy path.

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

Tracked alongside `../../server/docs/storylines-plan.md`.
