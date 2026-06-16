# 1. Mobile safe-area (landscape) + storylines stacked-card layout

**Date:** 2026-06-16

## 1.1 Problem

Two phone-screen issues on `/storylines`, reported with portrait + landscape
screenshots:

1. **Landscape:** the header was not flush to the top of the screen and there was
   "blank space" on the side — the notched-iPhone safe-area inset showing as
   background bars.
2. **Anchors column too wide:** the storylines list is a `<table>` whose Anchors
   cell wraps chips, forcing the column wide; on a phone it only scrolled
   sideways. Wanted a nicer small-screen design.

This is a different axis from the earlier
[`260614-mobile-responsive-overflow.md`](./260614-mobile-responsive-overflow.md)
work, which fixed **portrait** horizontal-overflow clipping by adding scroll
wrappers. That change left the shell at `overflow-x-hidden` and never opted into
iOS edge-to-edge rendering, so the **landscape notch** behaviour was untouched.

## 1.2 Root causes

1. **No iOS safe-area opt-in.** `index.html` used the default
   `viewport-fit=auto`, and a repo-wide grep for `safe-area` / `env(` found
   nothing. With `auto`, iOS constrains the layout viewport to the safe area in
   landscape, rendering the notch / home-indicator regions as solid background
   bars and offsetting the sticky header from the physical screen edge.
2. **Storylines list is a single fixed table.** `StorylineListView.vue` rendered
   only a table; the wide wrapping-chip Anchors column dominated width on small
   screens with no alternate layout.

## 1.3 Fixes

### 1.3.1 Global safe-area opt-in (W1)

- `index.html`: `viewport-fit=cover` added to the viewport meta.
- `DefaultLayout.vue` root flex: `pl/pr/pb` `env(safe-area-inset-*)` padding
  (horizontal notch clearance + home-indicator clearance).
- `AppHeader.vue` inner wrapper: `pt-[env(safe-area-inset-top)]` so header
  controls clear a portrait notch; the blurred header background still bleeds to
  `top: 0`.
- `AppSidebar.vue`: left+top insets via `calc(1rem + env(...))`. The mobile
  off-canvas sidebar is `absolute` to the viewport (not inside the padded root),
  so it must inset itself. `p-4` was split into `pr-4 pb-4` + the two calc paddings
  to avoid a `p-4`-vs-`pl-*` cascade conflict.

`body` is already `bg-gray-100 dark:bg-gray-900` (same as the shell), so any
exposed safe-area strip blends. Insets resolve to `0` off-device and in
happy-dom, so they're inert in tests and on desktop.

### 1.3.2 Storylines stacked-card layout (W2)

User chose "stacked cards" over collapse/horizontal-scroll. The table is now
`hidden sm:block`; a new `sm:hidden` `<ul>` renders one tappable card per
storyline (checkbox + name, wrapped anchor chips, a `Last generated · Created`
meta line, Regenerate/Delete). Both branches iterate the same `sortedStorylines`
and reuse the existing handlers (`onRowClick`, `toggleSelect`, `isSelected`,
`openRegenerateRow`, `onDeleteRow`); pagination footer and modals are shared and
unchanged.

**Test gotcha:** happy-dom renders both the table and the card branch regardless
of CSS media queries, so card elements got **distinct** `data-testid`s
(`storyline-card`, `storyline-card-checkbox`, `card-delete-button`,
`card-regenerate-button`, `storyline-card-name`, `storyline-card-anchor-chip-*`).
Reusing the table testids would have made existing `findAll('[storyline-row]')`
assertions match twice. 6 new tests added (TDD red→green); existing 23 list tests
untouched.

## 1.4 Verification

- Suite: **1833 tests pass**; coverage above the 85% gates (statements 92.1 /
  branches 85.8 / functions 90.8 / lines 94.4). Lint + build (type-check) clean.
- **Not** browser-verified: `env(safe-area-inset-*)` only resolves nonzero on a
  real notched device — headless Chromium reports 0 — so the landscape fix must
  be confirmed on-device. The change is the standard iOS pattern.

## 1.5 On-device follow-up (landscape edge-to-edge)

Deployed to prod (`ssh media`, `/srv/media`, `docker compose pull/up -d
journal-webapp`) and checked on a Dynamic Island iPhone. Portrait (cards) looked
right. Landscape still showed gray gutters on both sides — those were the
`pl/pr env(safe-area-inset-*)` I'd put on the `DefaultLayout` root: on a Dynamic
Island phone the landscape side insets are ~45px each, rendered as body-gray
strips. User wanted surfaces edge-to-edge.

Fix: **removed the horizontal safe-area insets from the layout root** (kept
`viewport-fit=cover`, the header `top` inset for the portrait notch, the root
`bottom` inset for the home indicator, and the sidebar's own content inset). The
header and content now fill the full screen width in landscape. The island in
landscape sits vertically centred on the side edge (below the header row), so the
header isn't occluded; content keeps its normal `px-4`+ gutter. Lesson: with
`viewport-fit=cover`, keep **surfaces** full-bleed and only inset **content that
would actually be occluded** — don't inset the root container, which pushes the
whole app inward.

## 1.6 Follow-up (not done)

Apply the stacked-card pattern to the other table views (Entries, Job History) for
a complete mobile pass — recorded in the run's evaluation report, out of scope
here. Still also open from the prior entry: a shared `<TableScroll>` / base table
primitive.
