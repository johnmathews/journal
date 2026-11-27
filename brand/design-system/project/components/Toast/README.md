# Toast

A short message in the bottom-right corner that confirms an action worked, or says it failed, and goes away by itself after five seconds.

## Use

- **Success:** after a save, a delete or a queued job, when the page itself doesn't show the change yet ("Setting updated", "Draft refresh queued.").
- **Error:** when an action that has no form to hold an [Alert](../Alert/README.md) fails, such as a bulk delete ("Deleted 2 of 3; 1 failed.").
- **Info:** supported by `useToast().show()`, but no screen uses it yet.
- Keep it to one sentence. Something the person must act on belongs in an Alert or a [Dialog](../Dialog/README.md), because a toast disappears.

## Anatomy

- Fixed 16px from the bottom and right of the window, stacked upwards `space-2` apart, at most 384px wide.
- `radius-md` (8px), `shadow-lg`, padding `space-3` by `space-4`, text in `label`.
- A mark before the message (a tick for success, a cross for error, hidden from screen readers), and a Dismiss button (×) after it at 70% opacity, full on hover and focus.
- **Success:** emerald-600 fill, white text. **Error:** red-600 fill, white text. **Info:** `ink` fill, `on-ink` text.
- It slides up and fades in over 300ms, and out over 200ms.

## What the consumer provides

Call the composable: `const toast = useToast()`, then `toast.success('Setting updated')` or `toast.error('Failed to update setting')`, with an optional duration in milliseconds. `AppToast.vue`, mounted once in `App.vue`, draws them.

## Do and don't

- Do end the message with a full stop when it is a sentence. Short labels like "Setting updated" may go without one, as today.
- Don't put a link or a second action in a toast.
- Don't fire a toast for every row of a bulk action. Summarise once.

## Known misses

The success and error fills are kept as today's look: white on emerald-600 is 3.8:1 and white on red-600 is 3.4:1, below the 4.5:1 that text needs. The system has no tokens for them, so the preview writes the colours directly. They are candidates for a later mockup.
