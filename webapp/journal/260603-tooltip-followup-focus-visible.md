# Tooltip follow-up — bump delay to 1200ms, fix focus-stick bug

Follow-up to [260602-mood-trends-tooltip-delay.md](./260602-mood-trends-tooltip-delay.md).
After deploying yesterday's fix and exercising the Mood Trends chart in
the browser, two refinements:

## Bug — tooltip stuck open after click

Reported: hovering a mood-group chip, then clicking it, then moving the
mouse away leaves the tooltip visible until the user clicks elsewhere.

**Root cause.** `BaseTooltip` was using `:focus-within` on the wrapper
as a secondary trigger (to keep the tooltip visible for keyboard users
who tab onto the trigger). Clicking a `<button>` chip leaves keyboard
focus on the button after the click — and `:focus-within` matches focus
regardless of how it arrived. So:

1. Mouse enters chip → `:hover` matches → tooltip opens after delay.
2. Click → focus moves to the button.
3. Mouse leaves → `:hover` no longer matches, but `:focus-within` still
   does → tooltip stays.
4. User clicks anywhere else → focus moves off the button → tooltip
   finally closes.

**Fix.** Replace `:focus-within` with `:has(:focus-visible)` on the
wrapper. `:focus-visible` only matches focus the UA considers worth
showing a focus ring for — i.e. keyboard navigation, not mouse clicks.
So a keyboard user who tabs onto the chip still gets the tooltip, but
a mouse user who clicks it does not pin it open.

`:has()` is needed because `:focus-visible` applies to the focused
element itself, not its ancestors; `wrapper:has(:focus-visible)` lets
the wrapper detect keyboard focus on any descendant. Browser support
is solid in all evergreen browsers (Chrome 105+, Safari 15.4+,
Firefox 121+) — which covers our target audience comfortably.

While moving to `:has()`, the hover/focus opacity+visibility transition
moved fully into the scoped `<style>` block instead of being split
between Tailwind utility classes and scoped CSS. One place to read,
one mechanism.

## Delay bump 700ms → 1200ms

The 700ms OS-standard default still felt eager when actually using the
dashboard — moving the mouse from one chip to another in the same row
would sometimes catch a tooltip mid-pass. Bumped the default to 1200ms,
which is closer to the dwell duration users actually exhibit when
they're reading a description rather than scanning.

This is a default; call sites can still override via `openDelayMs`.

## Files

- `src/components/BaseTooltip.vue` — default delay 700 → 1200; switched
  focus trigger from `:focus-within` to `:has(:focus-visible)`; moved
  the hover/focus visibility CSS fully into the scoped style block.
- `src/components/__tests__/BaseTooltip.spec.ts` — updated default-delay
  assertion to 1200ms; added a regression test that `focus-within` does
  not appear in the body's class list.
