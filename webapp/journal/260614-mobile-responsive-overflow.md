# 1. Mobile / portrait responsive overflow fixes

**Date:** 2026-06-14

## 1.1 Problem

On a portrait phone, content wider than the screen was **clipped and unreachable**:
table columns past the right edge couldn't be seen or scrolled to (Entities list), and
action buttons were pushed off-screen (Entity-detail header "Merge into…" + the buttons
beside it). Reported with two screenshots; the brief was to find the **root causes** and
fix the whole class of bug across all views, not just the two examples.

## 1.2 Root causes

1. **The shell clips overflow instead of letting it scroll (the amplifier).**
   `layouts/DefaultLayout.vue` wraps page content in `overflow-y-auto overflow-x-hidden`.
   That's a correct guard against whole-page sideways scroll, but it makes _any_ widget
   wider than the viewport silently clip with no scrollbar. So every wide widget must
   manage its own horizontal overflow — and several didn't. Kept as-is; the fix is to make
   the widgets self-manage.
2. **Tables wrapped in `overflow-x-auto` only sometimes (pattern drift).** No shared
   table/scroll primitive, so the wrapper was applied ad-hoc. EntryList/StorylineList/
   JobHistory/ApiKeys/AdminDashboard had it; EntityList (whose card even used
   `overflow-hidden`), FitnessView, and FitnessSyncPanels did not.
3. **Desktop-width flex toolbars with no `flex-wrap` and non-shrinking children.** Flex
   items default to `min-width:auto`, so a title/heading next to a button cluster (with no
   `flex-wrap`) pushed the cluster past the edge — then R1 clipped it. Same for horizontal
   tab strips (`whitespace-nowrap` tabs) in Settings and Admin.

## 1.3 Fixes

- **Table scroll wrappers** (`overflow-x-auto` + `min-w-[…]` so columns stay readable and
  scroll rather than crush): `EntityListView`, `FitnessView` (recent workouts),
  `FitnessSyncPanels` (recent runs), `EntityDistributionChart` legend (defensive).
- **Wrapping toolbars** (`flex-wrap` + `min-w-0`/`break-words` on long titles):
  `EntityDetailView` header, `EntryDetailView` sticky uncertain-nav bar,
  `StorylineDetailView` header groups.
- **Scrollable tab strips** (`overflow-x-auto no-scrollbar`): `SettingsView` tabs,
  `admin/AdminLayout` tabs.
- **Wrapping stat rows**: `admin/AdminOverview` health summary, `admin/AdminMoodsView`
  dimension headers.

## 1.4 Verification

Static sweep across every view, then a real-browser sweep at **375×812** with Playwright:
a detector measured `documentElement.scrollWidth − clientWidth` and flagged any element
whose right edge exceeded the viewport _and_ was not inside a scroll container. The
browser sweep caught four offenders the static pass missed (the two tab strips, the admin
health stats, the admin moods labels) — added to the fix set. Final sweep: **0 page
overflow and 0 out-of-scroller offenders** on dashboard, entries, entries/new, fitness,
storylines, search, jobs, settings, api-keys, admin, admin/runtime, admin/pricing,
admin/server, admin/moods, and both reported views (the latter stress-tested with a
deliberately very long entity name). Suite: **1783 tests pass**, coverage above the 85%
gates, build clean.

## 1.5 Follow-up (not done)

Extract a shared `<TableScroll>` / base table component so the `overflow-x-auto` pattern
can't drift again (addresses root cause R2 permanently). Tracked as a recommendation, not
in this change.
