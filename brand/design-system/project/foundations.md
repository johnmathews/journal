# Foundations

This section records the rules behind the tokens: where today's values came from, how contrast is measured, and which of today's colours still miss. The values themselves are in `tokens.json`.

## Where the values come from

Journal's shell came from the Cruip Mosaic admin template. Its greys, its red, green and yellow scales, and violet are Mosaic's own, kept as they were. The roles name what those values do, and they don't change how anything looks.

| Role | Light | Dark | Was |
| --- | --- | --- | --- |
| `canvas` | `#f3f4f6` | `#111827` | gray-100 / gray-900 |
| `panel` | `#ffffff` | `#1f2937` | white / gray-800 |
| `tile` | `#f9fafb` | `#374151` | gray-50 / gray-700 |
| `line` | `#e5e7eb` | `#374151` | gray-200 / gray-700 at 60% |
| `control-border` | `#6b7280` | `#6b7280` | gray-500 (was gray-200, changed 2026-11-27) |
| `ink` | `#1f2937` | `#f3f4f6` | gray-800 / gray-100 |
| `ink-secondary` | `#4b5563` | `#bfc4cd` | gray-600 / the custom gray-300 |
| `error-ink` | `#c52727` | `#ff7474` | red-800 / red-400 (light was red-700, changed 2026-11-27) |
| `accent` | `#8470ff` | `#8470ff` | accent-500 (violet shown) |

Dark fills drawn as a transparent tint in the app (`dark:bg-red-900/20`) are flattened onto `panel` in `tokens.json`. They match exactly on a panel and come out a shade different on `canvas`.

## Contrast

Contrast is measured with the WCAG 2 formula in both themes, and the gate (`scripts/check_design_system.py`, run in CI) fails any pairing below its floor:

- Text 4.5:1 on every ground it sits on: `ink`, `ink-secondary` and `error-ink` on `canvas`, `panel` and `tile`.
- Control edges and the focus ring 3:1 on `canvas` and `panel`.
- `ink-secondary` on `panel` 7:1, the project's own stricter aim for secondary text. It measures 7.6:1 in light and 8.4:1 in dark. On `canvas` it is 6.9:1 in light and on `tile` 5.9:1 in dark, so the aim reads "about 7:1".
- Badge and alert text on its own fill 4.5:1: `error-ink` on `error-surface`, `success-ink` on `success-surface`, `accent-tint-ink` on `accent-tint`.

## Decisions

Each visual change is decided on a mockup in `brand/design-system/mockups/` in the repository.

| Date | Decision |
| --- | --- |
| 2026-11-26 | The app icon: pen and paper, white on a tile in the user's accent. |
| 2026-11-26 | The accent is a per-user setting. Violet is the default and stays exactly as it was, its two contrast misses included. The other choices are green, emerald, blue, rose and graphite. |
| 2026-11-27 | Form contrast: control edges in `control-border` (1B), light error text in `error-ink` (2B), a solid 2px focus ring in the accent on every element (3B). |
| 2026-11-27 | Dashboard: when the default range has fewer than 5 entries, the first load opens on the shortest range that has 5 or more and says so in an `accent-tint` note with a link back (C). |

## Known gaps

The rules above describe where Journal is going. These pairings miss them today and are kept as they are. Each is either the owner's choice or waiting for its own mockup.

| Where | Measured | Status |
| --- | --- | --- |
| White text on a violet button | 3.7:1 (needs 4.5) | Kept by the owner's choice (2026-11-26). Every other accent passes. |
| Violet links (`accent-fg`) on white | 3.7:1 (needs 4.5) | Kept by the owner's choice (2026-11-26). |
| Warning text on its yellow fill, light | 2.6:1 | Open. Needs a mockup. |
| White on the success toast (emerald-600) | 3.8:1 | Open. |
| White on the error toast (red-600) | 3.4:1 | Open. |
| White on the danger button (red-500) | 2.9:1 | Open. |
| Placeholder text, gray-400 on white | 2.5:1 | Open. Placeholders are hints, and every field also has a label. |
| Remove icons in red-400 on white | 2.6:1 (icons need 3) | Open. |
| Some metadata in gray-500 / dark gray-400 (Job History) | 4.8:1 on white | Passes 4.5 but misses the "nothing lighter than gray-600" rule. |

## Drift that doesn't fail

The app is not yet built from the roles everywhere. About 2,400 `gray-N` utilities predate them. They render the same values, and they move to the role utilities when a screen is next touched. A few draw one step off the role:

- Form labels are gray-700 / gray-300, between `ink` and `ink-secondary`. Labels have no role of their own yet.
- The current sidebar item's label is gray-900 / white, one step stronger than `ink`.
- Cards use Tailwind's `shadow-xs` in places, a lighter shadow than `shadow-sm`.
- The failed badge's fill is red-100, and alerts use red-50 (`error-surface`).
