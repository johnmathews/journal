# Tabs

A tab strip switches between the sections of one page, such as Settings: labels on a `line` rule, the current one underlined in the accent.

## Use

- For four to seven sibling sections of one page (Settings, the admin pages). Each tab is reachable by its URL hash.
- Labels are one or two words in sentence case: Profile, Notifications, Appearance.
- For moving between pages, use the Sidebar.

## What the consumer provides

- A wrapper with `border-b border-gray-200 dark:border-gray-700/60 overflow-x-auto no-scrollbar`, a `<nav aria-label="…">` with `-mb-px flex space-x-6`, and one `<button>` per tab with `whitespace-nowrap border-b-2 py-3 px-1 text-sm font-medium` (`src/views/SettingsView.vue`).
- The current tab: `border-accent-fg text-accent-600 dark:text-accent-400` and `aria-current="page"`. The others: `border-transparent text-gray-600 dark:text-gray-300` with a hover border.
- A `data-testid` per tab, `settings-tab-<id>`.

## States

- **Current:** an `accent-fg` underline, the label in `accent-hover` (accent-600) in light and accent-400 in dark.
- **Rest:** `ink-secondary` label. **Hover:** a grey underline.
- **Focus:** a solid 2px ring in `focus` (decided 2026-11-27), drawn 2px inside the tab because the strip scrolls and would clip a ring outside it.

## Do and don't

- Do let the strip scroll sideways on a phone rather than wrap.
- Don't nest a second tab strip inside a tab.
