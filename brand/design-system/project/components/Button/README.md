# Button

A button runs an action: primary in the accent for the one main action on a view, secondary on the panel for the rest.

## Use

- One primary button per view or dialog, for the action the person came to do: Sign In, Save, New entry.
- Secondary buttons for everything else: Cancel, Edit, Back, Retry.
- Danger only for removing something for good, and only behind a confirmation dialog.
- Label a button with a verb and its object, in sentence case: "Delete entry", not "OK".

## What the consumer provides

The Vue app has no button component. A button is a `<button>` with the `.btn` class (or `.btn-sm`, `.btn-lg`, `.btn-xs`) from `src/assets/utility-patterns.css`, which sets the font, padding, `rounded-lg` and a transparent border, plus colour utilities:

| Variant | Classes |
| --- | --- |
| Primary | `btn bg-accent-500 hover:bg-accent-600 text-white` |
| Secondary | `btn bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700/60 text-gray-600 dark:text-gray-300 hover:text-gray-800 dark:hover:text-gray-100` |
| Danger | `btn bg-red-500 hover:bg-red-600 text-white` |

Add `disabled:opacity-50 disabled:cursor-not-allowed` when the button can be disabled.

## States

- **Hover:** primary darkens to `accent-hover`, secondary's label turns `ink`.
- **Focus:** a solid 2px ring in `focus` (the accent) at a 2px offset on `:focus-visible` (decided 2026-11-27).
- **Busy:** a spinner and an "-ing" label ("Signing in..."). The button is disabled while busy. Prefer keeping full colour with `aria-busy` for new buttons, since a faded label is harder to read.
- **Disabled:** 50% opacity, only when the action really can't run.

## Known misses

- White on violet's 500 is 3.7:1, under the 4.5:1 text needs. The owner kept violet exactly as it was (2026-11-26). Every other accent carries white at 4.5:1 or better.
- The danger fill (red-500) carries white at 2.9:1 and has no token yet.

## Do and don't

- Do keep the button's width to its label, except full width in the sign-in forms.
- Don't use the accent for a second button beside the primary one.
- Don't use a link styled as a button for an action that changes data.
