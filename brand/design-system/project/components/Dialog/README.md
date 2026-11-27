# Dialog

A window over a dimmed page that asks for one decision or one short form, such as confirming a merge or starting a batch job.

## Use

- For a choice that needs the person's attention before anything happens: merging entities, creating a storyline, running a backfill with options.
- Keep it to one decision. The title names it ("Alias already in use", "New storyline"), and the primary button says what will happen ("Merge entities", not "OK").
- Don't use a dialog to report that something worked. That is a [Toast](../Toast/README.md).

## Anatomy

- A 50% black scrim over the page, with `space-4` around the dialog.
- The dialog: `panel` fill, a 1px `line` edge, `radius-lg` (12px), `shadow-lg`, at most 90% of the window's height, the body scrolling inside.
- **Header:** the title in `title-3`, `ink`, and a close button (a 16px cross in `ink-secondary`), padded `space-4` by `space-5`, with a `line` rule below.
- **Body:** `body` text in `ink-secondary`, padded `space-4` by `space-5`.
- **Footer (optional):** buttons at the right, `space-2` apart, the primary last, with a `line` rule above.
- Widths: `sm` 384px, `md` 448px (the default), `lg` 512px.

## States

- **Open:** focus moves into the dialog. Tab stays inside it until it closes.
- **Focus:** every control shows the 2px `focus` ring at a 2px offset (the close button, in the preview).
- **Closing:** Escape, the close button or a click on the scrim, unless the dialog is busy.
- **Busy:** the primary button's label changes ("Merging…") and both buttons are disabled.

## What the consumer provides

`BaseModal.vue` with `v-model` (open or closed), `title`, optional `size` (`sm`, `md`, `lg`), the body as the default slot and the buttons in the `footer` slot. Use the shared button classes (`btn-sm`) in the footer.

## Do and don't

- Do give every dialog a title. Screen readers announce it through `aria-labelledby`.
- Do put Cancel before the primary action.
- Don't open a dialog from inside another dialog.
- Don't use the error colours on the primary button for an ordinary action.

## Note

The scrim is black at 50% (`bg-black/50`). The system has no token for it, so the preview writes it directly.
