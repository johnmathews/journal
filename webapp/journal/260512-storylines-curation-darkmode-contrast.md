# Storylines curation — fix dark-mode contrast

Tiny follow-up to the storylines footnote redesign shipped earlier today. In dark
mode the curation column (dates + italic quotes) was visibly washed out compared
to the narrative column. User flagged it as below contrast threshold.

## Diagnosis

`StorylineCurationList.vue` set its date and quote colors in scoped CSS using
`:global(.dark) .curation-date { ... }` / `:global(.dark) .curation-quote { ... }`.
The light-mode quote color was `rgb(55 65 81)` (gray-700) — illegible on the
`bg-gray-800` dark panel if the dark rule wasn't taking effect. The screenshot
showed exactly that failure mode: the quotes looked dimmer than the dates,
which is impossible if the dark rule (`gray-200`) had landed.

`StorylineNarrative.vue` next door uses the same `:global(.dark)` pattern and
its footnote markers render correctly, so the failure is selector-specific
rather than a global :global() regression. Didn't dig further into the Vue
scoped-CSS compilation — the proven pattern in the same view's narrative body
text (`text-gray-800 dark:text-gray-200` Tailwind utility on the element) sits
right there and is cheaper to mirror than to debug.

## Fix

Moved date and quote colors out of scoped CSS onto Tailwind utility classes
directly on the spans:

- `.curation-date` → `text-gray-500 dark:text-gray-300` (was gray-500 / gray-400)
- `.curation-quote` → `text-gray-700 dark:text-gray-100` (was gray-700 / gray-200)

Both dark-mode colors bumped one step lighter while we were in there, which
also improves the contrast ratio independently of the selector question.
Removed the now-redundant `:global(.dark)` rules and bare `color:` declarations
from the scoped block. Layout/typography rules in scoped CSS stay as they were.

## Verification

- 10/10 component specs pass (they assert structure, not color).
- Full unit suite green: 1593/1593.
- Lint, prettier, and `npm run build` all clean.
- Did not spin up the backend + dev server to confirm visually in a browser —
  the change is utility-class-only and follows the same pattern as the working
  narrative body text. Flagged this gap to the user.

## Follow-up worth picking up later

The other `:global(.dark)` rules in `StorylineCurationList.vue` (row hover
background, border colors, link colors) are still in scoped CSS. They appear to
render correctly per the screenshot, so leaving them alone for now — but if a
similar contrast complaint surfaces against any of them, the cheapest fix is
the same Tailwind-utility migration done here rather than debugging why one
particular `:global(.dark)` rule didn't apply.
