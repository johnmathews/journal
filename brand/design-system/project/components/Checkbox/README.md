# Checkbox

A checkbox picks items from a list, such as entities to merge: a 16px square with a `control-border` edge that fills with the accent when checked.

## Use

- For choosing several items at once, mostly to act on them together (the entity list's select mode).
- For a single setting that takes effect at once, use a Switch instead.
- The label sits to the right and is part of the click target.

## What the consumer provides

- `<input type="checkbox" class="form-checkbox h-4 w-4">` inside a `<label>`, from `src/assets/utility-patterns.css`. The class sets the accent fill and the white tick.
- The label text, and a count of what is selected near the list ("2 selected") when the selection drives an action.
- Radios (`form-radio`) share the same rules with a round shape.

## States

- **Unchecked:** `panel` fill, 1px `control-border` edge (gray-500, decided 2026-11-27).
- **Checked:** `accent` fill, white tick, no edge.
- **Focus:** a solid 2px ring in `focus` at a 2px offset (decided 2026-11-27).

## Do and don't

- Do keep the whole row clickable.
- Don't use a gray-300 edge. The decided edge is `control-border`, the same as text fields.
