# App accent: violet or green

**Question:** should the app's accent stay violet or turn green to match the new green icon? Only
the accent changes: layout, greys, type and the green "Succeeded" status colour stay as they are.

**Status:** decided

**Link:** https://claude.ai/artifact/9kij6fqKBVnPEYfKNCGeeG

## Options

The accent is every primary button, the active nav item, unread badges, links, active filter
chips, entity avatars, checkboxes and the focus outline: about 400 `violet-N` uses across 57
views. A swap replaces it step for step with an accent scale.

- **V. Violet, as today.** Green icon beside a violet app. Measured: white on the primary button
  (`violet-500` `#8470ff`) is 3.7:1, below the 4.5:1 text needs; links in `violet-600` are 4.4:1
  on white. Both are existing misses, to fix either way.
- **F. Forest green, matching the icon.** Accent-500 is the icon's `#15803d`. Every pairing on the
  page passes in both themes (button 5.0:1, links 6.6/5.9:1, chips 7.8/11.7:1), with the focus
  outline and checkboxes one step lighter (accent-400 `#4cb874`) in dark. Cost: close to the
  success green, so "Succeeded" reads like accent. (Recommended: one brand colour, and it fixes
  the contrast misses.)
- **E. Emerald.** Accent-500 `#047857`, a cooler, more teal green, a little further from the
  success green. The icon would move to `#047857` too.

## Decision

**None of the three as a fixed choice: the accent becomes a per-user setting**, decided
2026-11-26. Owner: "can we make this a settings toggle in the app?" Default violet, unchanged;
more colours offered. Continued in [`261126-appearance-setting`](../261126-appearance-setting/README.md).

## Rounds

- **1, 2026-11-26:** the first options. Owner, on the icon page: "can you show me a mockup or
  artifact showing the app accent color as green compared to current?"
