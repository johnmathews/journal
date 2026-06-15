# 1. Storylines detail: horizontal chapter strip + `data-testid` standardization

**Date:** 2026-06-15

## 1.1 Problem

On `/storylines/N`, the Narrative and Curation panels were cramped. Root cause
was the layout in `StorylineDetailView.vue`: chapters lived in a fixed-width
(`md:w-56`, ~224px) left `<aside>` rail inside a `md:flex-row`, so the two-panel
reader only got the remainder. With one chapter the rail was mostly empty
vertical space.

## 1.2 Change

1. **Chapters → horizontal strip.** Removed the left rail; chapters now render
   as a `flex flex-wrap` row of chips in a `data-testid="chapters-bar"` block
   directly below the anchors/meta row (chapters are chronological, so they read
   left-to-right). The reader (`data-testid="storyline-reader"`) is now full
   width; its two panels keep `lg:flex-1` to split 50/50.
   - Chose `flex-wrap` over a horizontal-scroll strip because `ChapterEditMenu`'s
     dropdown is `absolute`-positioned and would be clipped inside an
     `overflow-x-auto` scroll container. Wrap is also more robust on portrait
     phones (verified at 375 / 1024 / 1440 px).
   - Each chip is a `data-testid="chapter-chip"` container holding the select
     button (`chapter-rail-item`), the `chapter-generating` badge, and the edit
     menu — preserving the `button.parentElement` traversal the generating-badge
     test relies on.

2. **`data-test` → `data-testid` standardization.** The storyline/chapter files
   were the only ones using the short `data-test=` spelling (16 attrs across 4
   files); the rest of the app uses `data-testid=`. Renamed them (and the ~50
   matching test selectors) so there is one canonical naming attribute. No `id`s
   added — `data-testid` already provides a stable, app-wide vocabulary for
   referring to elements. See `docs/element-naming.md`.

## 1.3 Verification

- `npm run test:coverage`: 1817 passed; coverage ≥85% on all metrics.
- `npm run lint` and `npm run build` clean.
- Browser screenshots of the layout at 375/1024/1440 px (run dir
  `.engineering-team/runs/manual-20260615T195612Z/`).

## 1.4 Follow-ups (optional)

- The `data-test` → `data-testid` standardization was scoped to the storyline
  files (the only offenders). No further rollout needed — the rest of the app
  was already consistent.
