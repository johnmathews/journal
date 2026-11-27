# TextField

A text field takes typed input: a label above, a field with a `control-border` edge, and an accent ring when it has focus.

## Use

- Every field has a visible label above it, never a placeholder in its place.
- The placeholder is an example or a hint ("you@example.com", "Enter your password").
- The same look covers `<input>`, `<select>` and `<textarea>`.

## What the consumer provides

- A `<label for>` with `block text-sm font-medium mb-1` and `ink-secondary` colour, and the field with `form-input w-full` (or `form-select`, `form-textarea`) from `src/assets/utility-patterns.css`.
- The `id` the label points at. Form fields are the one place plain `id`s are used.
- Errors go in an Alert above the form today, written to say what happened and what to do.

## States

- **Rest:** `panel` fill (in dark, 30% `canvas` over `panel`), `ink` text, a 1px `control-border` edge (gray-500, decided 2026-11-27).
- **Focus:** the border turns `accent-fg` and a solid 2px ring in `focus` sits 2px outside it (decided 2026-11-27).
- **Disabled:** `tile` fill and `ink-secondary` text.
- Text is 16px below the `sm` breakpoint so phones don't zoom in, and 14px above it.

## Do and don't

- Do size the field to the form, full width inside a card.
- Don't drop the label to save room, and don't fade the label of a field that is only optional.
- Don't use `line` (gray-200) for a field's edge. It is 1.2:1 and hides the field.
