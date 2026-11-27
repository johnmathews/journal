# Appearance: accent colour

**Question:** how should the accent-colour setting look, and which colours should it offer? It is
a new "Appearance" tab in Settings. Violet stays the default and stays exactly as today; the icon
stays green whatever is picked.

**Status:** decided

**Link:** https://claude.ai/artifact/TTFy2T2K1QqZdF9FGA7YJj

## Settled before this mockup (owner, 2026-11-26)

- The accent becomes a per-user setting, saved with the account (`PATCH /api/users/me/preferences`).
- Colours: "green, emerald, violet, and a few others". Proposed extras: blue, rose, graphite.
- Default for a user who never picks: violet.
- The favicon and sidebar logo stay green whatever is picked.
- Violet is left exactly as today, including its two contrast misses (button text 3.7:1, light
  links 4.4:1).

## Options

- **A. A row of swatches.** One circle per colour with its name underneath; the page recolours as
  soon as one is picked. (Recommended: compact, and the live page is the preview.)
- **B. Cards with a sample.** A radio card per colour with a short note and a sample button in that
  colour. Easier to compare; takes more room.

Every new colour has an accent-500 that carries white button text at 4.5:1 or better. In dark mode
the new colours draw focus outlines and checkboxes one step lighter (their 400) to clear 3:1 on
the dark panel; violet keeps its 500. Rose sits close to the error red.

## Decision

**A, the swatch row, with all six colours** (violet default, green, emerald, blue, rose,
graphite), decided 2026-11-26. Owner: "lets do A. swatch row. those 6 colors look good to me.
lets include graphite".

## Rounds

- **1, 2026-11-26:** the first options. Owner, on the accent mockup: "can we make this a settings
  toggle in the app?"
