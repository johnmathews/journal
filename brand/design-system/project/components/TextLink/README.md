# TextLink

A text link goes somewhere: another page, a setting, a sign-in step, drawn in the accent with no underline.

## Use

- For navigation inside a sentence or under a form: "Forgot password?", "Register", "Reconnect in Settings".
- The link text says where it goes. Never "click here".
- An action that changes data is a button, not a link.

## What the consumer provides

- A `<RouterLink>` (or `<a>` for an outside address) with `text-accent-fg hover:text-accent-600 dark:hover:text-accent-400`. Add `font-medium` when the link sits beside plain text of the same size, as "Register" does.
- The text. Keep it short and specific.

## States

- **Rest:** `accent-fg`, which follows the user's accent.
- **Hover:** one step darker in light (`accent-hover`), one step lighter in dark.
- **Focus:** a solid 2px ring in `focus` at a 2px offset (decided 2026-11-27).

## Known misses

Violet links are 3.7:1 on a white panel in light, under 4.5:1. The owner kept violet exactly as it was (2026-11-26). The other accents pass in light, and every accent passes in dark.

## Do and don't

- Do let the colour carry the link inside forms and lists.
- Don't make plain text accent-coloured: in this app the accent on text means "you can follow this".
