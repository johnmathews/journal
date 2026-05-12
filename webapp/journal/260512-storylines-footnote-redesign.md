# 2026-05-12 — Storylines: footnote redesign for the detail view

Follow-up to `journal/260512-storylines-strip-disclosure.md`. With the
disclosure path gone, the `/storylines/:id` view rendered both panels
through the same `StorylineSegments.vue` component, which interleaved
italicised citation quotes inside every text run. Curation was busy but
roughly readable (the quotes were the point); narrative was unreadable
as prose because every sentence had a quote shoved into the middle of
it. The decision: split the two panels into specialised renderers and
introduce a shared citation registry so the same source entry carries
the same `[N]` everywhere it appears.

## Design decisions

1. **Two specialised components, no shared renderer.** Once one panel
   wants prose-with-footnotes and the other wants a list, a single
   shared component is just a switch statement. Cleaner to write a
   `StorylineNarrative.vue` and a `StorylineCurationList.vue` and let
   each be exactly what its panel needs. Deleted
   `StorylineSegments.vue` and its spec.
2. **Narrative drives citation numbering.** The original instinct was
   to let curation drive (so curation rows read `[1] [2] [3] …` down
   the page), but the user's read was that narrative is the showpiece
   — "should read like prose" — so its footnote section should read
   cleanly in sequence. Curation rows can show non-sequential `[N]`;
   the chronological row order is what carries that panel's reading
   flow anyway.
3. **Footnotes live inside the narrative panel.** Per-page-bottom would
   have been more academic but the two-panel `lg` layout already eats
   horizontal real estate, and at narrow widths the page-bottom block
   would have ended up far below the curation list when curation is
   taller than narrative. Keeping footnotes inside the narrative card
   keeps the eye in one column.
4. **Backref `↩` on every footnote.** Cheap, materially useful for
   re-finding place after dipping into a footnote. `scrollIntoView`
   with `behavior: 'smooth', block: 'center'` for both directions.
   No URL hash mutation — the jump is intra-panel and a hash change
   would interfere with router history.

## What changed

- `src/composables/useCitationRegistry.ts` (new) — pure function
  `buildCitationRegistry(panels)` walks narrative first, then curation,
  returning `Map<entry_id, number>`. Each unique `entry_id` is assigned
  an incrementing `[N]` on first encounter; subsequent appearances
  reuse the same number. Spec covers narrative-only, curation-only,
  shared-entry-reuses-number, empty-panels, and trailing-curation
  cases — 7 tests.
- `src/components/StorylineNarrative.vue` (new) — body renders text
  spans + `<sup>` markers; Sources section renders one row per unique
  cited entry with quote + `entry #N` RouterLink + backref button.
  Body markers carry `data-marker="{N}-{instance}"`; the first occurrence
  (`{N}-0`) is the backref target. Defensive fallback: an `entry_id`
  missing from the registry renders `[?]` but still links to the entry.
  Spec covers 10 cases including the no-inline-quotes regression,
  non-sequential registry numbers, ascending footnote ordering, and
  both scroll directions (with happy-dom `scrollIntoView` stubbed).
- `src/components/StorylineCurationList.vue` (new) — walks segments
  pairing each text-segment-then-citation-segment into a row. Date
  label is the text immediately preceding the citation with trailing
  `:` and whitespace stripped; pending label clears after each row
  emit so consecutive citations don't share a label. Grid layout:
  date label left, italic quote middle, `[N]` + chevron link right;
  stacks under 640px. Spec covers 10 cases including dedup of pending
  label, missing-registry fallback, and non-sequential `[N]`.
- `src/views/StorylineDetailView.vue` — wires the new components.
  Adds a `citationRegistry` computed that calls
  `buildCitationRegistry(store.currentStoryline?.panels ?? {})` and
  passes it to both child components. Removed the
  `StorylineSegments` import. View-level test added that asserts
  the same `entry_id` cited by both panels surfaces the same `[N]`
  in each (shared-numbering verified end-to-end).
- `src/components/StorylineSegments.vue` + spec — deleted.
- `docs/storylines.md` — replaced the "Segment renderer" section
  (which still described the pre-disclosure-removal short/long quote
  branching and per-panel numbering — both stale) with sections on
  the new panel renderers and the shared citation registry. Updated
  the "Files" listing and follow-ups.

## Post-review tightening

Code review flagged `document.querySelector` inside the narrative
scroll handlers as a latent issue — only one `StorylineNarrative`
mounts today so the selectors are unambiguous, but a future
multi-instance page (modal, preview pane) would break. Scoped both
`scrollToFootnote` and `scrollToBodyMarker` to a component template
ref (`rootRef.value?.querySelector(...)`) so the queries stay correct
regardless of how many narrative panels are on a page.

## Test impact

Test count delta: +27 net (−9 from deleting `StorylineSegments.spec.ts`,
+7 from the registry composable, +10 from each new component, +1 from
the shared-numbering view assertion). Full suite: 1593 passing, lint
clean, build clean.

## Out of scope (carried forward as follow-ups)

1. Hover/popover preview of footnotes — additive enhancement on top of
   the current smooth-scroll behaviour. Worth doing once we've lived
   with the new layout for a bit.
2. Tufte-style margin notes — pretty but fights the two-panel layout.
3. Narrative prompt tuning for footnote-style output — the prose was
   written assuming inline quotes follow, so stripping them may leave
   occasional awkward seams. If reading the new layout reveals real
   problem sentences, we tune the server-side prompt. Captured as a
   follow-up in `docs/storylines.md`.
