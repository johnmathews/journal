# Panel

A raised surface on the page that holds one group of content: a settings row, a chart, a list or an empty state.

## Use

- Put a panel on `canvas`, never on another panel. Inside a panel, group with `line` dividers or a `tile` fill instead.
- One panel per job. A settings page stacks several, `space-4` apart.
- An empty state is a panel too, its text centred: a short line saying what is missing ("Not enough data yet"), a `body` line saying why, and a `caption` line saying what to try.

## Anatomy

- Fill `panel`, a 1px `line` edge, `radius-lg` (12px) corners and `shadow-sm`.
- Padding `space-4` (16px) for settings rows, `space-5` (20px) for cards with a title.
- The title is `label` in `ink-secondary` for a settings row, or `title-2` in `ink` for a section card. Help text is `caption` in `ink-secondary`.

## What the consumer provides

There is no panel component. Views write the classes:
`bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700/60 rounded-xl shadow-xs`, plus their own padding (`p-4`, `p-5`). The content and any action button go inside.

## Do and don't

- Do keep text in a panel at `ink` or `ink-secondary`. Nothing lighter is used for text people must read.
- Don't colour a panel to carry meaning. Status belongs in an [Alert](../Alert/README.md) or a [StatusBadge](../StatusBadge/README.md).
- Don't give a panel a coloured left border. The app doesn't use one.

## Note

The app's cards use Tailwind's `shadow-xs`. The system holds Mosaic's `shadow-sm`, which is close to it, so the preview draws that.
