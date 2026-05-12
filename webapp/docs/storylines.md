# Storylines (webapp)

**Status:** active reference. **Last updated:** 2026-05-12.

The webapp surface for the storylines feature shipped server-side at
`journal-server@8396c7e`. A storyline is a cross-entry narrative anchored on
a single entity. Two parallel panels — **curation** (verbatim entry excerpts
with Haiku-generated transitions) and **narrative** (third-person prose
grounded via the Anthropic Citations API) — are persisted server-side as
`Segment[]` and rendered as plain prose plus footnote-style RouterLinks back
to source entries.

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
  types/storyline.ts           — wire types: Segment, StorylineSummary, StorylineDetail
  api/storylines.ts            — list / get / create / regenerate / delete
  stores/storylines.ts         — Pinia store with `loading` + `detailLoading` split
  components/StorylineSegments.vue  — Segment[] renderer
  views/StorylineListView.vue
  views/StorylineDetailView.vue
```

## Segment renderer

`StorylineSegments.vue` walks the panel's `Segment[]`. There is no markdown
on the wire and no markdown library in the webapp — the renderer is a small
Vue component that emits plain text runs and `<RouterLink :to="/entries/N">`
for citations.

Citation handling has two modes by quote length:

- **Short quote** (≤ `inlineQuoteThreshold`, default 200 chars): rendered
  inline as italic text next to the footnote link. This is the curation
  panel's path — `entity_mentions.quote` returns short verbatim excerpts.
- **Long quote** (> threshold): collapsed behind a `<details>` disclosure
  showing "source". The narrator's Citations API call uses
  `source: "content"` documents today, so the API returns the **whole
  wrapped journal entry** as each citation's `cited_text`. Collapsing keeps
  the narrative panel readable; the `entry_id` link is what the user
  actually clicks.

Citations are numbered per-panel (1, 2, 3 …), so curation and narrative each
have their own footnote sequence — the user reads the panels independently.

## Regenerate flow

`POST /api/storylines/{id}/regenerate` returns 202 with `{job_id}`. The
detail view registers the job via `useJobsStore().trackJob(jobId,
'storyline_generation', { storyline_id })`. When the job reaches a terminal
state (`succeeded` / `failed`), a watcher re-fetches the detail so the
freshly-persisted panels show up. On failure, the regenerate-error banner
surfaces the server message; the toast confirmation handles the happy path.

## Follow-ups (out of scope for the webapp)

1. **Citation granularity.** Server-side — switch the narrator from
   `source: "content"` to `source: "text"` so each citation's `cited_text`
   is a sentence-level excerpt rather than the full wrapped entry. Would
   let the renderer drop the collapsed-disclosure path entirely and show
   the inline quote everywhere.
2. **Entity backfill.** Server-side — `journal extract-entities
   --stale-only` could reduce dependence on the FTS fallback for the
   seeded storylines and tighten the curation panel's signal-to-noise.

Neither blocks the webapp cycle; both are noted in
`../../server/docs/storylines-plan.md` under "Webapp cycle handoff".
