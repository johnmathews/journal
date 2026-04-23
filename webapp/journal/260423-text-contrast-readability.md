# Text Contrast & Readability Overhaul

**Date:** 2026-04-23

## Problem

Text across the app used low-contrast gray shades that were hard to read,
especially at small sizes (`text-xs`, 12px). The worst offender was the API
pricing dates on the Settings page using `text-gray-300` (contrast ~2.3:1 on
white) — nearly invisible. The broader pattern of `text-gray-400 dark:text-gray-500`
(~3:1 / ~2.5:1) appeared 75 times across 18 files for descriptions, metadata,
labels, and timestamps. Dark mode was equally affected.

## Changes

Simplified the text contrast system from three tiers to two:

- **Before:** primary (gray-800/900), secondary (gray-500/600), tertiary (gray-300/400)
  — the tertiary tier was too faint, especially for small text.
- **After:** primary (gray-800/900 / gray-100/200) and secondary (gray-600 / gray-300)
  — all secondary text meets WCAG AAA (~7:1 contrast).

### Specific fixes

1. Replaced all `text-gray-400 dark:text-gray-500` with `text-gray-600 dark:text-gray-300`
   (75 instances across 18 files — descriptions, hints, metadata, sidebar icons).
2. Fixed 2 critical instances: `text-gray-300 dark:text-gray-600` on API pricing dates
   and AppNotifications dismiss button (~2:1 contrast → ~7:1).
3. Upgraded all small uppercase headings (table headers, section labels) to
   `text-gray-600 dark:text-gray-300` for clear visual hierarchy.
4. Eliminated all remaining `text-gray-500 dark:text-gray-400` instances (~200 across
   27 files) to the consistent `text-gray-600 dark:text-gray-300` level.

### Files modified

30 `.vue` files across `src/views/`, `src/components/`, `src/components/layout/`,
and `src/App.vue`. Plus minor formatting cleanup in `src/stores/settings.ts`,
`src/utils/cost-estimates.ts`, and their tests.

## Design decisions

- Visual hierarchy now comes from font size and weight, not color variation.
  Headings use `text-2xl font-bold` → `text-lg font-semibold` → `text-sm font-semibold uppercase`.
  All secondary text uses the same gray-600/gray-300 regardless of semantic role.
- Targeting WCAG AAA (7:1) rather than just AA (4.5:1) because the app uses
  `text-xs` (12px) extensively, where bare-minimum AA contrast is visually strained.
- Documented the typography system in `docs/architecture.md`.
