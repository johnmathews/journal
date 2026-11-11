# Mood Trends — tooltip open delay

## Problem

The mood-group chips on the dashboard's Mood Trends chart (Affect axes,
Psychological needs, Active negative affect, Stance) use `BaseTooltip` to
expose each group's plain-English description on hover. Two complaints:

1. **Eager trigger.** The tooltip popped the instant the cursor crossed
   the chip — even when the user was just scanning their mouse across
   the toggle row. `BaseTooltip` was pure CSS `:hover` with no delay.
2. **Obscured surrounding UI.** Because there was no delay, the tooltip
   appeared over the chart header paragraph and adjacent chip rows
   during any casual mouse movement.

## Fix

Added an open delay to `BaseTooltip` itself (the component is the app's
single tooltip primitive, used here and intended for future use):

- New `openDelayMs` prop, default `700` (OS-standard tooltip dwell — Mac
  uses ~750, Windows ~500; 700 splits the difference).
- The delay is threaded through a `--tt-open-delay` CSS variable on the
  wrapper and consumed by a scoped style block that applies
  `transition-delay` **only on the hovered / focused state**. The base
  state has `transition-delay: 0ms`, so close is instant.
- Moved `transition-property` declaration into the scoped style so both
  `opacity` and `visibility` transition together. As a side benefit,
  hover-out now fades smoothly instead of flipping `visibility: hidden`
  discretely while opacity was still mid-fade.

## Why no JS timers

`BaseTooltip` is deliberately CSS-only — no Vue state, no portals, no
JS-managed timers. Keeping the delay in CSS (`transition-delay` keyed
off `:hover`/`:focus-within`) preserves that invariant: still accessible
to keyboard users via focus, still no per-instance JS overhead, still
works inside `v-for` without leaking timer handles.

## What I deliberately did not change

1. **Tooltip styling** (`bg-gray-900` / white text). `BaseTooltip` is
   the app's tooltip language, used elsewhere too. A global restyle is
   a bigger conversation than this bug warranted, and after the delay
   fix the high-contrast surface no longer flashes into the user's
   peripheral vision on every mouse pass.
2. **`placement="bottom"` for the group chips.** Tempting because the
   description paragraph above is more important to keep visible, but
   bottom placement would just shift the obscuring onto the next row of
   chips. Once the tooltip only appears on deliberate dwell, the user
   has actively chosen to read it — at that point obscuring adjacent
   chrome is acceptable.

## Caveat

Not browser-verified — exercising the change end-to-end would mean
bringing up Chroma + backend + webapp, logging in, and dwelling on a
chip. Unit tests cover the wiring (prop → CSS variable). Worth a quick
in-browser sanity check before relying on the new default.

## Files

- `src/components/BaseTooltip.vue` — `openDelayMs` prop, CSS variable
  threading, scoped style block for the delay.
- `src/components/__tests__/BaseTooltip.spec.ts` — added two tests
  covering default and custom `openDelayMs` values.
