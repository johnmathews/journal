# Switch

A switch turns one setting on or off at once, such as a notification topic: a pill track that fills with the accent when on.

## Use

- For a setting that takes effect as soon as it is flipped, with no Save button.
- One row per setting: the label on the left, the switch on the right.
- For picking items to act on later, use a Checkbox.

## What the consumer provides

- A `<button type="button" role="switch" :aria-checked>` with `relative inline-flex h-6 w-11 shrink-0 rounded-full border-2 border-transparent`, `bg-accent-500` when on and `bg-gray-200 dark:bg-gray-600` when off, and a knob `<span>` with `h-5 w-5 rounded-full bg-white shadow` that moves with `translate-x-5` (`src/components/NotificationsSettings.vue`).
- The label, tied to the button with `aria-labelledby` or `aria-label`.
- The `.form-switch` pattern in `utility-patterns.css` is the Mosaic one and no view uses it.

## States

- **Off:** `line` track in light, gray-600 in dark. **On:** `accent` track. The knob is white in both.
- **Focus:** a solid 2px ring in `focus` at a 2px offset (decided 2026-11-27). This replaces the old `focus:ring-2 ring-offset-2`.

## Known misses

The off track is 1.2:1 on the panel in light, so its shape is carried by the white knob and its shadow. The on track in violet is 3.7:1 against white.

## Do and don't

- Do save as soon as it flips, and say so if the save fails.
- Don't put a switch in a form that has a Save button.
