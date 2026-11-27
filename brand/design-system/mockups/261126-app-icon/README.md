# App icon

**Question:** which mark becomes the favicon, the home-screen icon and the logo beside the
sidebar title? The colours, Inter and the "JOURNAL INSIGHTS TOOL" title stay as they are.

**Status:** decided

**Link:** https://claude.ai/artifact/QLDeRZ3762UdfNhDBBb8gv

## Options

All three are a white glyph on the app's existing violet tile (`#755ff8`, violet-600), one fixed
tile in both themes, drawn on a 32-unit grid with a 7-unit corner radius.

- **A. Page and spark.** A ruled journal page with a four-point spark knocked out of its top-right
  corner: the entry, then the insight. (Recommended: reads as "notes" at 16px, and the spark is
  what makes it this app rather than any notes app.)
- **B. Handwritten j.** (Dropped in round 2.) A lowercase j as one leaning pen stroke and a dot. The most legible at
  16px, but says the letter, not what the app does.
- **C. Lines into a trend.** (Dropped in round 2.) Two ruled lines and a third that turns into a rising line chart. Tells
  the whole story; has the most detail to lose at 16px.

- **D. Pen nib.** A fountain-pen nib, tip down-left, with slit and breather hole. Says "writing";
  close to design apps' pen-tool icon.
- **E. Pen and paper.** A ruled page with a pen writing its last line. Most literal; close to the
  generic "edit / compose" icon.

Round 3, the colour of E (the app keeps its violet accent in every option):

- **V. Violet, as today** (`#755ff8`). Matches the app's accent. (Recommended: one brand colour.)
- **B. Blue** (`#2563eb`). Glyph 5.2:1; tile on the dark sidebar 2.8:1.
- **G. Green** (`#15803d`). Glyph 5.0:1; tile on the dark sidebar 2.9:1. Green already means
  "succeeded" on the Jobs page.

Measured on the page (round 1): glyph on tile 4.4:1; tile on the sidebar 4.4:1 light, 3.3:1 dark.

## Decision

**E (pen and paper) on green `#15803d`**, white glyph, decided 2026-11-26.

- Mark, round 3: "Lets do E".
- Colour, round 4: "green for the icon!"

**Revised the same day: the icon follows the accent.** Owner, after trying the build: "lets make
the icon and favicon follow the swatch color though. it doesnt make sense to have them be always
green when you can choose the accent color for other areas". Green remains one of the accents.

Whether the app's violet accent follows the icon to green is a separate question:
[`261126-app-accent`](../261126-app-accent/README.md).

## Rounds

- **1, 2026-11-26:** the first options (A, B, C).
- **2, 2026-11-26:** owner: "A is the best of the three, but what about something with a pen, and
  something with a pen and paper?" B and C dropped; D (pen nib) and E (pen and paper) added.
- **3, 2026-11-26:** owner picked E: "Lets do E, but why is it purple? can we trial some other
  colors? what about blue or green?" Mark settled; the page now asks only the colour, with the
  app's violet active nav and button beside each icon.
- **4, 2026-11-26:** owner picked green for the icon and asked to see the app accent in green
  next to today's violet; that question moved to its own mockup.
