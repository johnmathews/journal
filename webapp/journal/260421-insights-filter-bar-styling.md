# Insights filter bar styling fix

**Date:** 2026-04-21

## Problem

The sticky filter bar on /insights did not conform to the site theme:
- No rounded corners (cards use `rounded-xl`)
- No horizontal padding (cards use `px-5`), so "RANGE" label and buttons sat flush left
- Only a bottom border (`border-b`) with translucent background — when floating over chart
  content while scrolled, there was poor visual separation

## Fix

Restyled the filter bar to match the card pattern used by Mood Trends and What I Write About
sections:

- `rounded-xl` — card-consistent border radius
- `px-5` — horizontal padding matching cards
- `border` (all sides) instead of `border-b`
- `shadow-xs` — card shadow
- `bg-white dark:bg-gray-800` — opaque background matching cards (was translucent `bg-white/95`)
- Removed `-mt-3` negative margin that was compensating for the old borderless layout

## Files changed

- `src/views/InsightsView.vue` — filter bar class list (line 386)
