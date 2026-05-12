# Storylines detail-view UI redesign — improvement plan

Target: `/storylines/:id` view. Make the narrative read like prose and the
curation read like a list, while preserving the link back to every source
entry. Server stays untouched — this is a renderer-only change.

## Decisions

1. **Two specialised renderers, no shared component.** The existing
   `StorylineSegments.vue` is replaced by `StorylineNarrative.vue` and
   `StorylineCurationList.vue`. The shared component was a useful seam when
   both panels rendered as prose; with one panel as prose-with-footnotes and
   the other as a structured list, the shared API stops earning its keep
   and forces both call sites to special-case the same component.
2. **Numbering is driven by narrative walking order.** Citations are
   assigned `[N]` in the order they appear in the narrative panel, then
   any curation-only entries get the next numbers. Reasoning:
   - The narrative is the showpiece — "reads like prose" — and its
     footnote section reading `[1] [2] [3] …` sequentially is the
     cleanest version of a footnoted essay.
   - Curation rows will therefore show non-sequential `[N]` values
     (a curation-only entry might be `[14]`, the next one back to
     `[2]` if that entry was narrative-cited first). The chronological
     row ordering is unchanged — only the `[N]` labels are non-sequential.
     Acceptable because curation is read primarily for the date+quote
     sequence, with `[N]` as a secondary identifier.
3. **Footnotes live inside the narrative panel, not at the page bottom.**
   Per user pick — keeps the eye in one column at `lg`, sidesteps the
   awkward case where the curation panel is taller than the narrative
   panel and pushes the footnote block far below the body.
4. **Backref affordance in each footnote.** Small `↩` button that scrolls
   back to the `[N]` marker in body. Cheap to build, materially helps
   re-finding your place after dipping into a footnote.
5. **Smooth-scroll for the in-panel jump.** `scrollIntoView({ behavior:
   'smooth', block: 'center' })` for both the forward jump and the
   backref. No URL hash mutation — the jump is purely intra-panel, and a
   hash change would interfere with router history.

## Non-goals

1. Any server change. The `Segment[]` wire shape stays as-is; the
   redesign is renderer-only.
2. Hover/popover preview of footnotes (Option D from the discussion).
   Worth doing later as an additive enhancement once Option A ships.
3. Tufte-style margin notes (Option C). Pretty, but the two-panel layout
   already eats horizontal space.
4. Synced scrolling between panels.
5. Mobile-specific footnote treatment. Stacking behaviour stays as it is
   today; we revisit if it feels wrong in use.
6. Tuning the server-side narrative prompt for footnote-style output
   (i.e. ensuring prose still flows when inline quotes are stripped).
   Captured as a follow-up in the doc, not work for this plan.

## Work units

Ordering rationale: foundation (W1) → scaffolding (W2) → parallel
component builds (W3 + W4 — different files, no overlap) → wiring (W5)
→ docs + journal (W6, W7).

---

### W1 — Citation registry composable

**Priority:** High. **Risk:** Low. **Size:** S.

**Changes:**
- New file `src/composables/useCitationRegistry.ts`. Exports a function
  `buildCitationRegistry(panels: StorylineDetail['panels']): Map<number, number>`
  that walks segments in order (**narrative first**, then curation) and
  assigns each unique `entry_id` an incrementing `[N]`. The returned Map
  is keyed by `entry_id` and yields the citation number for that entry.
- Pure function, no Vue reactivity inside — the caller wraps it in
  `computed()`.

**Test impact:**
- New file `src/composables/__tests__/useCitationRegistry.spec.ts`. Cover:
  curation-first ordering, dedup of repeated entry_ids, narrative-only
  entries get trailing numbers, missing panels handled gracefully, empty
  segments don't blow up.

**Reversibility:** Pure additive code. Revert deletes the file.

**Dependencies:** None.

**Acceptance criteria:**
- `buildCitationRegistry` returns expected number assignments for a
  fixture where narrative drives `[1]`, `[2]`, `[3]` and curation-only
  entries pick up the next numbers.
- All new unit tests pass; existing test count goes up, no regressions.

---

### W2 — Scaffold new renderer components

**Priority:** High. **Risk:** Low. **Size:** S.

**Changes:**
- Create `src/components/StorylineNarrative.vue` (empty shell with
  `<script setup lang="ts">` + props typed as
  `{ segments: Segment[]; registry: Map<number, number> }`).
- Create `src/components/StorylineCurationList.vue` (empty shell with
  the same prop shape).
- Both inherit the serif typography rules from
  `StorylineSegments.vue`'s `<style scoped>` block — kept inline for now,
  may extract to a shared CSS partial if duplication grows.
- Do NOT delete `StorylineSegments.vue` or its tests in this unit; that
  comes in W5 after the new components are wired up, so we never have
  a moment where the detail view points at nothing.

**Test impact:** None yet. Tests come in W3 and W4.

**Reversibility:** Delete the new files.

**Dependencies:** None (but ordering: must precede W3, W4, W5).

**Acceptance criteria:**
- `npm run build` succeeds (typecheck clean).
- Existing tests still pass — nothing has been removed or rewired.

---

### W3 — Narrative panel: prose + footnotes

**Priority:** High. **Risk:** Medium (real new behaviour, smooth-scroll
into anchors). **Size:** M.

**Changes:**
- `src/components/StorylineNarrative.vue`:
  - Walk `segments`. For each `text` segment, render a span. For each
    `citation` segment, render a `<sup>` containing an `<a>` whose
    click handler smooth-scrolls to the matching footnote element.
    **The inline italic quote is removed from body.**
  - Each body marker carries a unique `data-instance` id so backrefs
    can target the right occurrence when the same `entry_id` is cited
    twice; the first body marker for `[N]` is the backref target.
  - Build a deduped footnote list: unique `entry_id`s the narrative cites,
    sorted by `[N]` ascending. Each footnote row:
    - Leading `[N]` marker (matching the body anchor target).
    - Quote in italic.
    - `RouterLink` to `/entries/{entry_id}` rendered as the entry id with
      an external-link glyph.
    - Backref `↩` button that scrolls to the first `[N]` body marker.
  - Footnotes section is separated from body by a thin top border and
    a small "Sources" eyebrow label.
  - `data-testid` attributes: `narrative-body`, `narrative-body-marker-{N}`,
    `narrative-footnote-{N}`, `narrative-footnote-link-{N}`,
    `narrative-footnote-backref-{N}`.

**Test impact:**
- New file `src/components/__tests__/StorylineNarrative.spec.ts`. Cover:
  body renders text + citation markers in source order, body has no
  inline quotes, footnote section lists each unique entry_id once,
  footnote entry link points at `/entries/{id}`, clicking a body marker
  triggers `scrollIntoView` on the right footnote element (mock
  `scrollIntoView` since happy-dom doesn't implement it), backref scrolls
  back to body, missing registry entry for an `entry_id` is treated as
  a defensive fallback (renders `[?]` rather than crashing — we still
  link to the entry).

**Reversibility:** Pure additive code until W5 wires it in. Revert by
deleting the file (and the spec).

**Dependencies:** W1 (registry), W2 (scaffold).

**Acceptance criteria:**
- Narrative body contains no italic quote text — quotes only appear in
  the footnote section.
- Clicking `[1]` in the body scrolls the matching footnote into view
  (verified in test via mocked `scrollIntoView`).
- Clicking the `↩` in a footnote scrolls the corresponding body marker
  into view.
- Footnote link `href` is `/entries/{entry_id}`.

---

### W4 — Curation panel: table-style row list

**Priority:** High. **Risk:** Low. **Size:** M.

**Changes:**
- `src/components/StorylineCurationList.vue`:
  - Group segments into rows. Algorithm: walk segments left-to-right;
    accumulate the most-recent non-empty `text` segment as the row's
    "date label"; on each `citation` segment, emit a row
    `{ dateLabel, entryId, quote, citationNumber }` and clear the
    pending label. Trailing text segments (no following citation) are
    dropped.
  - Strip trailing `:` and whitespace from the date label.
  - Row layout (CSS grid):
    - Left column (~10ch, right-aligned): date label in a smaller,
      slightly muted weight.
    - Middle column (flex-1): the quote in italic serif.
    - Right column (auto): `RouterLink` showing `[N]` and a small
      chevron, aligned right.
  - Rows separated by a thin divider. Hover state lightens the row
    background subtly.
  - `data-testid` attributes: `curation-row-{N}`, `curation-row-date-{N}`,
    `curation-row-quote-{N}`, `curation-row-link-{N}`.

**Test impact:**
- New file `src/components/__tests__/StorylineCurationList.spec.ts`. Cover:
  one row per citation segment, date label inherited from the preceding
  text segment, trailing colon stripped, link points at
  `/entries/{entry_id}`, `[N]` matches registry value, empty segments
  array renders zero rows without crashing, citation without preceding
  text gets an empty date label (regression for the first-row case).

**Reversibility:** Delete the file.

**Dependencies:** W1, W2.

**Acceptance criteria:**
- One row per citation. Date label is the text immediately preceding
  that citation, with `:` and whitespace trimmed.
- `[N]` numbers come from the shared registry (verified by passing a
  registry that assigns non-sequential numbers and checking the
  rendered output matches).

---

### W5 — Wire up StorylineDetailView, retire StorylineSegments

**Priority:** High. **Risk:** Medium (touches the live view; ordering
matters — replace before delete). **Size:** S.

**Changes:**
- `src/views/StorylineDetailView.vue`:
  - Import `buildCitationRegistry`, `StorylineNarrative`,
    `StorylineCurationList`.
  - Add `const registry = computed(() => buildCitationRegistry(
    store.currentStoryline?.panels ?? {}))`.
  - Replace the curation panel's `<StorylineSegments :segments="...">`
    with `<StorylineCurationList :segments="curationPanel.segments"
    :registry="registry">`.
  - Replace the narrative panel's `<StorylineSegments :segments="...">`
    with `<StorylineNarrative :segments="narrativePanel.segments"
    :registry="registry">`.
  - Keep all surrounding chrome (header, meta strip, empty-state copy)
    unchanged.
- Delete `src/components/StorylineSegments.vue`.
- Delete `src/components/__tests__/StorylineSegments.spec.ts`.

**Test impact:**
- `src/views/__tests__/StorylineDetailView.test.ts`:
  - The mock detail fixture already produces valid `Segment[]` — no
    changes there.
  - Any assertion that referenced the old `segment-...` test IDs is
    rewritten against the new components' test IDs.
  - Add an assertion that the same `entry_id` cited in both panels
    receives the same `[N]` (shared-numbering behaviour verified
    end-to-end at the view level).

**Reversibility:** Revert commit. The deleted component would come
back; nothing on disk is unrecoverable.

**Dependencies:** W1, W2, W3, W4.

**Acceptance criteria:**
- `/storylines/:id` renders curation as a row list and narrative as
  prose-with-footnotes. Visually verified in the browser (see Phase 3
  visual-check note below).
- Full test suite passes. Coverage stays above the 85% gates.
- No remaining import of `StorylineSegments`.

---

### W6 — Update `docs/storylines.md`

**Priority:** Medium. **Risk:** Low. **Size:** S.

**Changes:**
- `webapp/docs/storylines.md`:
  - "Files" section: replace `StorylineSegments.vue` with
    `StorylineNarrative.vue` and `StorylineCurationList.vue`.
  - "Segment renderer" section: rewrite. Replace the "short/long quote
    by threshold" explanation (already inaccurate post-disclosure
    removal) with a description of the new split — narrative renders
    prose + a Sources section; curation renders a row list; numbering
    is shared via the `useCitationRegistry` composable.
  - Update the "Citations are numbered per-panel" sentence to describe
    shared registry / curation-driven ordering.
  - Note the smooth-scroll + backref behaviour briefly.

**Test impact:** None (docs only).

**Reversibility:** Revert commit.

**Dependencies:** W5 (don't write the new doc state until the code
matches it).

**Acceptance criteria:**
- File names referenced in `docs/storylines.md` match files that exist.
- No mention of the deleted `<details>` disclosure path.
- No mention of "per-panel numbering" as current behaviour.

---

### W7 — Journal entry

**Priority:** Medium. **Risk:** Low. **Size:** S.

**Changes:**
- New file `webapp/journal/260512-storylines-footnote-redesign.md`.
  Captures: motivation (reading flow), the curation-drives-numbering
  decision, the in-panel footnote choice, the component split, what
  was kept out of scope (hover preview, margin notes, prompt tuning).

**Test impact:** None.

**Reversibility:** Revert commit.

**Dependencies:** All other units (it documents what shipped).

**Acceptance criteria:**
- File exists with the correct `YYMMDD-` prefix.
- References the actual files that changed.

---

## Visual verification (Phase 3 close-out)

After W5 lands, run the dev stack end-to-end and walk
`/storylines/:id` for the seeded "Running" storyline shown in the
screenshot. Check:

1. Narrative body reads as continuous prose — no italic quotes
   breaking sentences.
2. Clicking `[1]` in the narrative body scrolls smoothly to the
   matching footnote inside the narrative panel.
3. The footnote `↩` returns scroll to the body marker.
4. The footnote entry link navigates to `/entries/{id}` and back works.
5. Curation panel shows rows with date label | quote | `[N]` chevron;
   numbers match the shared registry; clicking a row's chevron lands
   on the source entry.
6. Stacked mobile layout (resize below `lg`) still works — narrative
   footnotes stay in the narrative card; curation rows wrap sensibly.

If verification fails on any of the above, the failure is a defect in
the unit it belongs to, not a separate finding.
