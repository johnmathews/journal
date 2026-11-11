# Editor caret offset: textarea scrollbar

> Purpose
>
> Records why the Corrected Text caret sometimes landed a line away from the
> visible text, how it was found, and the one-class fix.

## 1. Symptom

While fixing OCR mistakes in edit mode, in some entries the edits landed about
one line away from where the caret appeared. Most entries were fine. Reported in
Chrome on a Mac.

## 2. Cause

The editor stacks three layers in one grid cell: an invisible sizer, the
highlighted backdrop (what the user sees) and a transparent textarea (what
takes input). The textarea kept the default `overflow: auto`.

The line height is `0.9375rem × 1.625 = 24.375px`, so the grid row has a
fractional height (2112.25px for entry 125). The textarea's integer
`scrollHeight` could exceed its `clientHeight` by a sub-pixel. On macOS with
"Show scroll bars: Always" (or a mouse attached), Chrome then draws a classic
15px scrollbar. That cut the textarea's text width from 692px to 677px, so it
wrapped about two extra lines. The sub-pixel overflow became a real one, and
the scrollbar stayed. Whether the first rounding tips over depends on the line
count, which is why only some entries were affected.

Measured on the live page, entry 125: a click on the visible words "few minutes
I could," put the caret at offset 4930 (end of the previous paragraph) instead
of 5001.

## 3. Fix

`overflow-hidden` on the textarea. The grid already sizes it to its content, so
it never needs to scroll. Applied as a live style override, the same click
landed on 5001 and the textarea's width matched the backdrop (692px).

A regression test pins the class (`EntryDetailView.test.ts`). happy-dom does no
layout, so a real width check would need a browser test runner, which the
project does not have.

## 4. Investigation notes

- Playwright launches Chrome with `--hide-scrollbars` by default, so the first
  harness runs (real entry text, every width and pixel ratio) showed
  pixel-perfect alignment. Relaunched with
  `ignoreDefaultArgs: ['--hide-scrollbars']`, the harness reproduced it: with
  `main`'s class list, 375 of 605 entry×width cases wrapped narrower or
  overflowed, and the same click landed at 4930, matching prod. With the fix,
  0 of 605. Check scrollbar mode early when debugging stacked-layer layout.
- The layout has two stable states. Once the scrollbar appears, the narrower
  wrap keeps the overflow real. A brief overflow (a render where the sizer lags
  the textarea) left the scrollbar stuck in 188 of 305 cases on `main` and 0
  with the fix.
- Side finding: the unit suite fails 62 tests under Node 26 (the local
  default) because Node's built-in `localStorage` shadows happy-dom's. CI uses
  Node 22. Filed as #54.
