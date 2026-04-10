# 2026-04-10 — Chunk overlay visual polish

Fix pass on the chunk/token overlay shipped earlier today. Captured via Playwright after running the servers locally, user flagged two concrete issues, both now fixed.

## Issues found in the browser

1. **Chunks mode was effectively a uniform wash.** The light-mode chunk backgrounds (`bg-sky-100/70`) were too faint to read against white, the left border (`border-sky-500/60 border-l-2`) was barely visible, and in the single-chunk case (every entry in the local seed DB) there was no alternation to help — the whole panel just looked vaguely bluish. Tokens mode was fine because the alternation carried the design.
2. **Dark mode contrast was dramatically worse for both modes.** `sky-900/40` and `green-900/40` at 70–80% opacity against a near-black panel (`gray-900/40` on `gray-800`) are basically dark blue on dark gray. The colour code was "technically there" but invisible unless you leaned in close.

## Fixes

1. **Colour strategy rewritten.** Light mode now uses the `200` shades at full opacity (strong enough to read without washing out); dark mode uses the `500` shade at 25–30% opacity (bright mid colours at low alpha are dramatically more visible than the old `900` shade at 40%, which was just dark blue on dark gray). Borders got thicker (`border-l-[3px]` from `border-l-2`) and picked up saturated border colours (`border-sky-600` light / `border-sky-300` dark) that actually show against the background fill.
2. **Chunk start badges.** The chunks-mode renderer now prepends a small dark-on-light (inverted in dark mode) `[N]` pill at the first interval of each chunk, showing the chunk index. This is the primary "here is where chunk N starts" marker — the alternating backgrounds reinforce it but are not sufficient on their own, especially for single-chunk entries where there's nothing to contrast with. Overlap regions get the correct badge too: if chunk 1 starts inside chunk 0's range, the `[1]` badge sits at the start of the overlap region, which is the semantically correct place.
3. **Segment type extended.** `OverlaySegment` gained an optional `chunkStartIndex` field. `buildChunkSegments` tags the first interval that begins at each chunk's `char_start` with its index (a `consumedStart` set prevents double-tagging when the same breakpoint fires twice). `segmentsToHtml` emits the badge HTML inside the chunk's `<mark>` wrapper so it picks up the chunk's own background tint and reads as part of the chunk.

## Visual verification

All four base combinations plus multi-chunk + overlap captured via Playwright against the running local dev servers (Vite port 5175, journal-server port 8400, chromadb docker on 8401):

1. Light mode chunks (single chunk) — prominent sky-600 left border, `[0]` badge, clear sky-200 fill.
2. Light mode tokens — alternating sky-200 / green-200, reads like a syntax-highlighted view.
3. Dark mode chunks (single chunk) — bright sky-300 left border and `[0]` badge stand out from the gray-900 panel.
4. Dark mode tokens — sky-500/25 and green-500/25 alternation clearly readable.
5. Multi-chunk synthetic test (injected 3 chunks into entry 5 via SQL, then restored via `backfill-chunks`) — verified chunk-a / chunk-b / chunk-overlap all render correctly, badges `[0] [1] [2]` at the right positions, violet overlap region visible between chunks 0 and 1.

## Tests

157 tests passing (up from 151). Six new composable tests for the chunk-start-index tagging and badge rendering:
1. `tagFirstSegmentOfEachChunk` — contiguous chunks each get their own badge
2. `doesNotTagSubsequentSegments` — overlap case: badge goes with the new chunk's start, subsequent re-entry to the earlier chunk does not re-tag
3. `plainSegmentsNeverCarryStartIndex`
4. `emitsBadgeWhenChunkStartIndexSet` (`segmentsToHtml`)
5. `doesNotEmitBadgeWhenUndefined`
6. `rendersChunkIndicesAsDistinctBadges`

Plus updated the existing view test to assert the badge appears in the rendered overlay HTML.

## Second polish pass — `<mark>` text colour override

User pushed back: dark mode was still low-contrast after the brightness bump. Reloaded the browser, inspected a rendered token via `getComputedStyle`, found the root cause:

```
container text color: rgb(243, 244, 246)  ← text-gray-100 (light, correct)
<mark> text color:    rgb(0, 0, 0)        ← black, overriding the inherited light colour
```

The HTML `<mark>` element has a **user-agent default `color: black`** baked in because it is designed for dark-text-on-yellow highlighter semantics. My class was only setting `background-color`, so the default `color: black` rule had higher specificity than the inherited `text-gray-100` from the container — the text was literally black against the tinted backgrounds in dark mode, which no amount of background tuning would have fixed.

Fix: explicit `text-gray-900 dark:text-white` on every overlay kind. Verified via `getComputedStyle` — text colour now reads `rgb(255, 255, 255)` in dark mode. Also bumped dark-mode alphas in the same commit (`sky-500/25` → `sky-400/40`, etc.) since I was touching the class map.

## Third polish pass — fuchsia overlap + brightness boost

User: "colors are good enough for now" — then pivoted after seeing a real 5-chunk entry: the violet overlap region was still hard to distinguish from the adjacent green chunk-b in dark mode. `getComputedStyle` confirmed the diagnosis — violet, sky, and green all sit at similar lightness in oklab space (L≈0.70-0.80 at α≈0.40-0.45), so at dark-mode opacities they blur together even though their hues are distinct.

Two fixes:
1. **Swap overlap hue from violet to fuchsia.** Fuchsia sits far from both sky (cool blue) and green in oklab — it's a warm magenta, hue-distance ~0.22 instead of ~0.05. Added the full Tailwind-default fuchsia scale to the project's `@theme` block in `src/assets/main.css` with a comment explaining it exists exclusively for this feature.
2. **Bump dark-mode alphas across the board.** Chunks 40% → 50%, overlap 45% → 55%, tokens 35% → 45%. Combined with the hue change, dark-mode overlay is now clearly readable and all three chunk kinds are immediately distinguishable at a glance.

Verified in both themes with both single-chunk (the default seed entries) and synthetic multi-chunk (re-backfilled entry 5 with `CHUNKING_MAX_TOKENS=25` to force 5 chunks with overlap between 0 and 1). Restored the default chunker config afterwards.

## Follow-ups still open

1. The original 277-word / 5-chunks investigation. Now that the overlay works, next step is to point it at the actual entry and see the boundaries. Not done in this session.
2. `refreshCachesOnSave` — cached chunks/tokens still don't invalidate on successful save; only on entry-id change. Minor; noted in the previous journal entry.
3. Chunker defaults (`max_tokens=150 overlap_tokens=40`) were discussed during the session. 150 is not canonically optimal — it is on the small side compared to LangChain/LlamaIndex defaults — but is a reasonable choice for a personal journal where sharper retrieval beats broader synthesis. The project ships a `journal eval-chunking` CLI which would let us sweep values against a real corpus if we ever wanted to validate this empirically.
