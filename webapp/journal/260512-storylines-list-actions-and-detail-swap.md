# Storylines — list actions + detail panel reorder + create / regenerate modals

**Date:** 2026-05-12
**Branch:** `eng-storylines-ux`
**Sibling commit (server):** `<sibling commit on server repo>`
**Plan:** `../.engineering-team/plan-storylines-ux.md`
**Reference doc:** [`docs/storylines.md`](../docs/storylines.md) (updated in this commit)

## What shipped

Two small fixes on the detail view, two new modal components on the
list view, plus the multi-select pattern that ties them together.
Pairs with the server-side append-update + auto-kick work — the
modals' payloads exist because the API accepts them now.

## Detail view: narrative-left, curation-right (W4) + curation date alignment (W5)

`StorylineDetailView.vue` had the curation panel on the left and
narrative on the right at the `lg:` breakpoint. The narrative is the
primary reading surface; the curation panel is the citation backbone.
Reading left-to-right, narrative deserves the left column. DOM order
drives `lg:flex-row` order — no CSS needed, just swapping the two
`<section>` blocks.

`StorylineCurationList.vue` had `.curation-date` with `text-align:
right`. In Relative mode the date strings vary in width ("Three days
later:" vs "Two weeks later:") and the right-aligned column made them
visually jitter left-and-right as you scanned down the list. Flipped
to `text-align: left`. Absolute mode (where everything was the same
width) looks identical; Relative mode is now stable.

## `StorylineCreateModal` + Create button (W9)

`src/components/StorylineCreateModal.vue` is a new component wrapping
`BaseModal` (size `lg`). The body is a debounced entity search
(reuses `fetchEntities`), a scrollable result list, a name field that
auto-fills from the selected entity's canonical name, and optional
description + start_date + end_date inputs.

The entity picker is **single-select** for now, but the internal state
is shaped as `ref<Entity | null>` rather than a single primitive so
the upgrade to multi-select for the deferred multi-entity follow-up is
a one-component edit. The component contract for the parent stays the
same either way.

On submit, the modal calls `store.createStoryline(request)`, fires a
toast, and tracks the returned `generation_job_id` via
`jobsStore.trackJob`. On job complete the list reloads. The server-
side auto-kick (W7) is what makes this work — the create POST returns
the job id, no second round-trip required.

## Multi-select + selection toolbar (W10) — reusable pattern

`StorylineListView.vue` now has a checkbox column on the left, per-row
Delete (text link) and Regenerate (icon) on the right, and a violet
`selection-toolbar` when ≥1 row is selected with "Delete N selected" /
"Regenerate N selected" buttons.

The pattern was **copied straight from `EntityListView.vue` lines
748–771** (the `ref<Set<number>>` + selection-toolbar approach). It
matches the existing visual language and means a third future list
view can copy from either source. Worth documenting here: any list
view that needs multi-row actions should follow this pattern rather
than inventing a new one. The pieces:

- `selectedIds = ref<Set<number>>(new Set())`
- a header checkbox (select all on page) + per-row checkboxes
- `selection-toolbar` (already styled in shared CSS) shown when
  `selectedIds.size > 0`
- bulk actions iterate the set sequentially (not concurrent — keeps
  error handling and toast sequencing simple)

## Delete confirms via `window.confirm` (D4)

The plan called out the choice explicitly: `window.confirm` rather
than a custom `ConfirmModal` component. Reasoning is consistency —
the detail-view storyline delete and the entity-merge confirm both
already use `window.confirm`. A custom modal would be nicer (theming,
keyboard handling, animation parity with the other modals) but it's a
separate refactor that should hit every confirm in the app at once.
Documented as a follow-up but not in scope.

## `StorylineRegenerateModal` + per-row / bulk Regenerate (W11)

`src/components/StorylineRegenerateModal.vue` wraps `BaseModal`. Body:
two `<input type="date">` for start_date / end_date in `grid-cols-2
gap-3`, plus a mode radio fieldset (Replace / Append-update — copied
the `BatchJobModal.vue` radio pattern lines 222–256). Defaults: dates
empty, mode=Replace, which preserves the no-body POST behavior the
detail view's header button relies on.

When `mode === 'append'`, a caption appears under the date inputs
explaining the boundary: "Process entries in this date range and
append them to the existing storyline. Range must start after the
storyline's last generation." Append mode also **requires** a
`start_date` — the submit button is disabled until one is filled.
Client-side guard for the boundary check the server enforces — the
server still validates `start_date >= last_generated_at` and returns
400 with a reason if violated, but the easy mistakes are caught
without a round-trip.

Multi-row submit iterates the selected set sequentially, collecting
each returned `job_id` and tracking via `jobsStore.trackJob`. One
toast per submit; the toast aggregates the count.

## Test scaffolding (W8) — extended files, didn't duplicate

The W8 plan called for new `.spec.ts` files for `StorylineListView`,
`StorylineDetailView`, and the storylines store. The repo already had
`.test.ts` files at those locations covering the existing surface, so
the right move was to **extend the existing files** rather than create
parallel `.spec.ts` doppelgangers. The `.test.ts` vs `.spec.ts` split
in this codebase isn't load-bearing — both extensions are picked up by
Vitest. Creating duplicate files would have meant maintaining two
suites for the same view; instead the existing files now also cover
the new pattern (selection toggling, modal open, delete confirm, etc.).

New `.spec.ts` files **were** created for the two new components
(`StorylineCreateModal.spec.ts`, `StorylineRegenerateModal.spec.ts`)
because no test file existed for those yet.

## Drive-by: `node:fs` types fix in `StorylineCurationList.spec.ts`

The pre-existing test file imported `node:fs` but TypeScript was
choking on the import. One-line `/// <reference types="node" />` at
the top fixed it. Unrelated to this work — surfaced when re-running
the spec after the W5 alignment change. Worth flagging so the next
person doesn't trip on the same thing in a different `node:`-importing
spec.

## Open items / deferred

- **Multi-entity storylines.** The plan's D1 (one storyline anchored
  on N entities) is deferred — see "Deferred / out-of-scope" in
  `.engineering-team/plan-storylines-ux.md` (units W5b/c/d). The
  `StorylineCreateModal` picker is structured to be a one-component
  edit when that lands.
- **`ConfirmModal` component.** Webapp-wide; would replace
  `window.confirm` everywhere at once. Not in scope.
- **Hover preview of footnote `[N]`.** Already noted in
  `docs/storylines.md` follow-ups; unchanged.

## Files touched

- `src/views/StorylineDetailView.vue` — panel order swap (W4).
- `src/components/StorylineCurationList.vue` — date alignment (W5).
- `src/views/StorylineListView.vue` — Create button, multi-select,
  selection toolbar, per-row Delete + Regenerate (W9, W10, W11).
- `src/components/StorylineCreateModal.vue` — new (W9).
- `src/components/StorylineRegenerateModal.vue` — new (W11).
- `src/api/storylines.ts` — regenerate signature accepts body (W11).
- `src/stores/storylines.ts` — `regenerate` forwards params (W11).
- `src/types/storyline.ts` — `CreateStorylineResponse` gains
  `generation_job_id`; new `RegenerateStorylineRequest` (W9, W11).
- Tests: `StorylineListView.test.ts`,
  `StorylineDetailView.test.ts`, `storylines.test.ts`,
  `StorylineCurationList.spec.ts` (alignment + node ref), plus
  new `StorylineCreateModal.spec.ts` and
  `StorylineRegenerateModal.spec.ts`.
- `docs/storylines.md` — updated to reflect new components, routes,
  flows.
