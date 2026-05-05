# 2026-05-05 — Mood group tooltips + admin "Moods" tab

Two pieces of follow-on work after the grouped-toggle UI shipped earlier
today:

1. **Tooltips on each group chip** explain what specialised psych vocabulary
   like "affect axes" actually means. Hovering (or focusing via keyboard)
   any group chip on the dashboard pops a small dark tooltip with a 1–2
   sentence plain-English description.

2. **A new admin "Moods" tab** at `/admin/moods` shows the live mood-
   dimensions config the server has loaded — operator-managed version,
   per-group descriptions (the same plain-English copy as the dashboard
   tooltips), and the full `notes` for each dimension.

## What's new

- `src/components/BaseTooltip.vue` — small CSS-only hover/focus tooltip.
  No JS state, no portal, no timers — visibility is pure
  `group-hover:` + `group-focus-within:` so screen readers announce the
  description (wired via `aria-describedby`) and keyboard users see it
  on focus. Default placement is `top` + `align="left"` (anchored to the
  trigger's left edge, since chips near the card's left margin would
  otherwise have their tooltip clip off-screen). `align="right"` and
  `align="center"` cover the other common cases. Tested in
  `src/components/__tests__/BaseTooltip.spec.ts`.
- `src/utils/mood-groups.ts` — each `MoodGroup` now carries a
  `description: string` field. The same string is used both in the
  dashboard chip tooltip and in the admin Moods tab.
- `src/views/admin/AdminMoodsView.vue` — new view. Reads
  `store.moodDimensions` and `store.moodDimensionsMeta` (newly exposed),
  buckets dimensions via `groupDimensions`, renders one panel per group
  with the plain-English description as a subhead and each dimension's
  full notes underneath. Frustration is rendered as "calm" via the
  existing `displayLabel` helper so the page stays consistent with the
  chart.
- `src/router/index.ts` — `/admin/moods` route, child of `/admin`.
- `src/views/admin/AdminLayout.vue` — "Moods" added to the admin tab
  bar after Server.
- `src/types/dashboard.ts` — `MoodDimensionsResponse.meta` (optional, so
  pre-existing fixtures that omit it don't all need touching).
- `src/stores/dashboard.ts` — captures `moodDimensionsMeta` on
  `loadMoodDimensions` and exposes it; resets on `reset()`.

## Tests

- `src/components/__tests__/BaseTooltip.spec.ts` (new) — 6 tests covering
  trigger rendering, popover body, `aria-describedby` wiring, default
  and `bottom` placement, and tooltip-slot precedence over the `text`
  prop.
- `src/views/admin/__tests__/AdminMoodsView.test.ts` (new) — 7 tests
  covering page render, version display from `[meta]`, fallback to
  "unknown" when version is empty, group panels in toml order,
  per-dimension rendering with poles + scale + notes, the
  frustration→calm display label, the empty state when scoring is off,
  and that the same per-group descriptions used in the tooltips are
  rendered on the page.
- `src/utils/__tests__/mood-groups.test.ts` — added an assertion that
  every group has a non-empty plain-English `description`.
- `src/views/admin/__tests__/AdminLayout.test.ts` — updated to expect
  the six tabs (added Moods) in the right order.

Final suite: **1296 / 1296 pass**, lint clean, build clean.

## Verification

Playwright walkthrough on the local stack with the synthetic mood-score
seed (reverted after capture). Screenshots in
`journal/screenshots/2026-05-05-mood-trends/`:

- `06-tooltip-affect-axes.png` — hovering the AFFECT AXES chip on the
  dashboard reveals the plain-English description.
- `07-admin-moods-page.png` — full-page capture of the new admin Moods
  tab showing the config-version banner, the toml's description, the
  AFFECT AXES group panel header with its description, and the joy
  dimension's poles + scale chip + full notes.

Zero console errors during the walkthrough.

## Cross-repo coordination

The server side adds the `[meta]` table to the toml + extends the
`/api/dashboard/mood-dimensions` response. The matching commit lives on
`journal-server`'s `260505-mood-dimensions-meta-block.md`. The webapp
treats `meta` as optional in TypeScript so older servers (running prior
to the matching server commit) degrade gracefully — version simply
reads as "unknown" on the admin page.
