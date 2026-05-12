# 2026-05-12 — Storylines: strip the disclosure path

Webapp follow-up to the server cycle that landed earlier today
(`server@d5825c4`). The narrator switched to Anthropic Citations
`source="text"` documents, which means every `Segment.quote` now arrives
sentence-length (50–200 chars) instead of carrying the entire wrapped
journal entry (1000+ chars). The defensive `<details>` "source"
disclosure in `StorylineSegments.vue` is now dead weight; the rationale
that justified it (per `journal/260512-storylines-webapp.md` decision
#2) no longer applies.

## What changed

- `src/components/StorylineSegments.vue` — dropped the `<details>` /
  `<summary>` branch, the `isInlineQuote` / `isCollapsedQuote` helpers,
  and the `inlineQuoteThreshold` prop with its default of 200. Citation
  segments now render uniformly: a footnote `[N]` RouterLink to
  `/entries/${entry_id}` immediately followed by the italicised quote
  (when non-empty). Net −34 lines in the SFC.
- `src/types/storyline.ts` — the `Segment` doc-comment no longer claims
  narrative quotes are "too bloated to render inline" and the disclosure
  is gone. Wire shape is unchanged: `{kind, text}` and `{kind, entry_id,
  quote}`.
- `src/components/__tests__/StorylineSegments.spec.ts` — dropped the
  "collapses long citation quotes behind a disclosure" and "respects a
  custom inlineQuoteThreshold" tests. Added a long-quote-inline test as
  a regression guard against re-introducing the disclosure, plus a
  citation-followed-by-period-text-segment test that pins down the
  stray "." bug (see below).

## The stray "." bug

The narrator emits sequences like `text("He ran fast") · citation(entry,
quote) · text(".")` — the trailing period closes the sentence after the
footnote. Under the disclosure-era code, the citation was followed by a
`<details>` element. `<details>` itself was given Tailwind's `inline`
class, but its child `<summary>` is `display: block` by default. That
pushed the very next text segment ("." in this case) onto its own line
below the disclosure, producing the visual "stray period" Atlas-storyline
panel showed.

Removing the `<details>` branch eliminates the block-level child, so the
trailing text segment now flows inline with the rest of the citation
node. The new test asserts there's no `<details>` in the tree and that
both text segments are rendered in source order — the layout assertion
is structural rather than pixel-based, but the layout regression maps
1:1 to the structural change.

## What's not changed

1. `Segment` wire shape — `{kind, text}` and `{kind, entry_id, quote}`,
   exactly as the server emits. No new `is_long` / `truncated` flag —
   the disclosure went away because quotes are short, not because we
   added a gate.
2. Citation link target — still `RouterLink :to="/entries/${entry_id}"`,
   in-place SPA navigation, no `target="_blank"`. Preserves back-button
   behaviour and matches every other entry link.
3. The text-segment branch — text segments still render plain prose with
   `white-space: pre-wrap`. They've always handled arbitrary length
   (paragraphs flow) and nothing in this change touches that path.
4. Curation panel rendering — same component instance, same code path.
   Curation always had short `entity_mentions.quote` excerpts; the
   disclosure was a narrative-panel-only problem the renderer guarded
   against universally. Removing the guard is uniformly safe.

## Coverage

1574 tests pass. Coverage held: 91.99% statements / 85.38% branches /
90.66% functions / 94.09% lines (pre-push gate is 85% on all four). Net
−41 lines across code + tests; ratios stay flat because both the code
and the tests for it went out together.

## Visual verification — not run end-to-end

The brief asked for a browser walk-through of the Atlas storyline
detail panel on the local stack. Chroma was up on `:8401` in this
session but the backend on `:8400` wasn't, and starting it requires
loading `JOURNAL_SECRET_KEY` from `server/.env`, which a sandbox rule
declined to let me read. I didn't pursue a workaround. Instead:

- The new spec includes a structural regression for both fixed bugs
  (long quote inline; trailing-period text segment preserved alongside
  the citation node).
- The change is mechanical — strip one conditional branch, drop one
  prop. No new code paths.
- Browser confirmation against prod is a one-minute hand-check after
  the next storyline regeneration; if anything visually surprising
  shows up, the spec didn't catch it and the right move is to add a
  test that pins down the actual DOM seen in-browser.

Calling this out so future-me knows the test suite did the work the
browser walk would have done, but didn't physically watch the pixels.

## Out of scope

1. Entity backfill — the other open webapp-cycle handoff item in
   `server/docs/storylines-plan.md`. Separate workstream.
2. The "entity-id mismatch" question (plan says 511/513, recent
   transcripts show 3/59). Not investigated here; orthogonal to this
   renderer change.
3. Server-side anything. The Segment wire shape, the Pinia store, the
   API client, and the route are all unchanged.
