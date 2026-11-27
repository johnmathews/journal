# Alert

A boxed message inside a form or a panel that says something went wrong, or needs attention, and stays until the cause is gone.

## Use

- **Error:** a request failed and the person has to act, such as a sign-in that didn't match or a save the server refused. Put it above the form it belongs to.
- **Warning:** something the person should know before they continue, such as an expired session on the sign-in page.
- For a passing confirmation ("Setting updated") use a [Toast](../Toast/README.md) instead. For a job's state use a [StatusBadge](../StatusBadge/README.md).
- The words carry the meaning, not the colour. Say what happened and what to do, in one or two short sentences. The server's own message is fine when it already does that.

## Anatomy

- `radius-md` (8px) corners, a 1px edge, padding `space-3` by `space-4`, text in `body`.
- **Error:** `error-surface` fill, `error-line` edge, `error-ink` text.
- **Warning:** `warning-surface` fill, a yellow edge (yellow-200 / yellow-700 at 60%), `warning-ink` text.
- Give it `role="alert"` when it appears after an action, so screen readers announce it.

## What the consumer provides

There is no alert component. Views write the classes, for example in `LoginView.vue`:
`rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700/60 px-4 py-3 text-sm text-red-800 dark:text-red-400`, and the message text.

## Do and don't

- Do keep an error next to what caused it.
- Don't fade an alert's text or shrink it below `body`.
- Don't use the error colours for anything that isn't an error. Rose, one of the accents, sits close to them, so the words must always say "error" plainly.

## Known misses

- Warning text, `warning-ink` on `warning-surface`, is 2.6:1 in light, below the 4.5:1 that text needs. It is kept as today's look and is a candidate for a later mockup. Dark passes at 9.0:1.
- Light error text moved from red-700 (3.6:1 in its box) to `error-ink`, red-800 (4.9:1), on 2026-11-27 (`mockups/261127-form-contrast`, 2B). Views still on `text-red-700` are being moved.
