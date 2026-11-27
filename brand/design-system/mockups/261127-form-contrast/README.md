# Form contrast: borders, errors, focus

**Question:** formalising the design system measured today's colours against its rules, and
three form details fall short. Should each one be fixed or kept? Layout, type, the greys and
violet (with its two known misses) stay as they are.

**Status:** decided

**Link:** https://claude.ai/artifact/JiFveWJWgLmyNY8aDYVcTS

## Options

Three independent questions. Option A of each is today.

1. **Input borders.** A: gray-200 (`#e5e7eb`) light, gray-700 at 60% dark, 1.2:1 on the card.
   B: gray-500 (`#6b7280`) in both themes, the `control-border` token: 4.8:1 light, 3.0:1 dark on
   the card. (Recommended: a field must read as a field, and 3:1 is the floor for a control's
   edge.)
2. **Error text.** A: red-700 (`#e63939`) light, 3.6:1 in its red-50 box. B: red-800
   (`#c52727`), the `error-ink` token, 4.9:1 in the box. Dark stays red-400 (5.4:1).
   (Recommended: an error is text people must read.)
3. **Focus.** A: a focused input darkens its border one step, and other controls get the
   browser's default outline. B: a solid 2px ring in `accent-fg`, 2px off the edge, on every
   `:focus-visible`, and the focused input's border in the accent. Violet's ring is 3.7:1 on the
   card in light and 4.0:1 in dark. (Recommended: keyboard focus becomes visible everywhere and
   follows the accent.)

## Decision

**1B, 2B and 3B**, decided 2026-11-27. Owner: "1B and 2B, as recommended", then 3B ("solid
accent ring") when asked about focus. Inputs, selects and checkboxes get `control-border`
(gray-500) edges, light-mode error text moves to `error-ink` (red-800), and every
`:focus-visible` gets a solid 2px ring in `accent-fg` at a 2px offset.

## Rounds

- **1, 2026-11-27:** the first options. Owner picked all three fixes.
