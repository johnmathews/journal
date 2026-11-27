# StatusBadge

A small pill that names a background job's state: queued, running, succeeded or failed.

## Use

- On Job History, in the table and in the phone cards, and wherever a job's progress is shown.
- The word is the state. Colour only helps a scan down the list, so the badge always shows its word.
- One badge per job. Don't use it for anything but a job's state. Job types have their own palette of tinted badges, kept outside the system as data colours.

## States

| State | Fill | Text |
| --- | --- | --- |
| Queued | `tile` | `ink-secondary` |
| Running | `accent-tint` | `accent-tint-ink` (follows the user's accent) |
| Succeeded | `success-surface` | `success-ink` |
| Failed | `error-surface` | `error-ink`, with a thin red ring so failures stand out |

## Anatomy

`caption` text at weight 500, padding 2px by `space-2`, `radius-full`. The app capitalises the status word with CSS (`capitalize`).

## What the consumer provides

The job's `status`. `JobHistoryView.vue` maps it to classes in `statusBadgeClass()` and renders
`<span class="inline-block px-2 py-0.5 rounded-full text-xs font-medium capitalize">{{ job.status }}</span>`.

## Do and don't

- Do keep the word. A coloured dot alone fails anyone who can't tell red from green.
- Don't use the success green or the error red for decoration anywhere else.

## Known misses

- The failed badge is `text-red-700` on `red-100` in the app today, 3.1:1. The 2B decision of 2026-11-27 (`mockups/261127-form-contrast`) moves light error text to `error-ink`, so the system draws it as `error-ink` on `error-surface` (4.9:1). The app follows when its error text is swept.
- The app's succeeded and running badges use Tailwind's own emerald and the accent at 20% in dark. The tokens hold those values flattened onto `panel`, so on a `tile` row they differ slightly.
