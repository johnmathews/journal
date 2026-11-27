This is the design system for Journal, a private web app that turns handwritten pages and voice notes into a searchable journal with dashboards, storylines and a chat over the entries. A design system is the set of colours, type, spacing, components and writing rules a product is built from. This document shows each part in light and dark, says where each one goes, and is what new screens are built from. It does not describe how the app works, its data or its code, and it is not a picture of every screen.

Journal is quiet and personal. It is one person's notebook, read back to them. The screens are neutral grey and white, so the writing and the charts carry the colour. One accent marks what can be pressed or what is current, and each user picks it.

## Colour

- Build every screen from the roles in `tokens.json`, never from a raw grey or red. In the app they are Tailwind utilities with the same names: `bg-canvas`, `bg-panel`, `bg-tile`, `border-line`, `border-control-border`, `text-ink`, `text-ink-secondary`, `text-error-ink`.
- Put the page on `canvas`. Put everything raised (the sidebar, cards, dialogs, menus) on `panel`. Use `tile` for quiet fills inside a panel: table headers, hover rows, code blocks.
- Set headings, values and entry text in `ink`. Set labels, descriptions, dates and metadata in `ink-secondary`, never lighter. The project aims at about 7:1 for secondary text.
- Draw dividers and card edges in `line`. Draw the edge of every input, select, checkbox and radio in `control-border`, which holds 3:1.
- The accent is the user's choice: violet (the default), green, emerald, blue, rose or graphite. Use it only for what can be pressed or what is current: the primary button (`accent` with `on-accent`), links and spinners (`accent-fg`), the current tab and nav item, checked boxes, unread badges, and soft selected states (`accent-tint` with `accent-tint-ink`). Never use it for body text or decoration. In code, write `accent-N` utilities or the accent roles, never `violet-N`.
- Status colours mean one thing each. `error-ink` on `error-surface` is an error, `success-ink` on `success-surface` is success, `warning-ink` on `warning-surface` is a warning. Each one always carries words, so it never relies on colour alone. Rose sits near the error red, which is one more reason the words are required.
- Chart series colours are data colours. They stay fixed whatever accent is picked (webapp/docs/chart-style-guide.md).

## Type

- Inter, from Google Fonts, in every size. Hierarchy comes from size and weight, not from paler greys.
- `title-1` (24px bold) is the page title. `title-2` (18px semibold) titles a section or card. `title-3` (16px semibold) titles a dialog or small card. `body` (14px) is running text and table cells. `label` (14px medium) is form labels, buttons, tabs and nav items. `caption` (12px) is timestamps, badges and hints, and nothing is smaller.
- Inputs are 16px on a phone (`text-base sm:text-sm`), so iOS does not zoom.

## Shape and space

- Space in 4px steps: `space-1` to `space-8`. Cards and dialogs pad by `space-5`. Form fields sit `space-4` apart.
- `radius-md` (8px) for inputs, buttons, alerts and nav items. `radius-lg` (12px) for cards and dialogs. `radius-xl` (16px) for the sign-in card and the sidebar's edge. `radius-full` for badges, swatches and switches.
- `shadow-sm` lifts a card a little. `shadow-lg` is only for what floats over the page: dialogs and toasts. Dark mode keeps the same shadows. They barely show there, and the panel's lighter grey does the lifting.

## Focus and states

- Every element reached with the keyboard shows a solid 2px ring in `focus` (the user's `accent-fg`), 2px off its edge. A focused input's border also turns `accent-fg`. Mouse clicks show no ring, except on text inputs, where browsers always show it.
- The accent picker's swatches are the one exception: their ring is `ink`, 4px off, because an accent ring would vanish against its own swatch.
- Only a truly disabled control fades (50% opacity). A busy button ("Signing in...") keeps full colour.

## Icons

- Icons are inline SVG paths, 16px in nav and buttons, drawn with `fill-current` so they take the text colour. There is no icon font and no emoji in the interface.
- The app icon is a ruled page with a pen writing its last line, white on a tile in the user's accent. It is in `assets/AppIcon/`, one master per accent. See that group's README.

## Writing

Read `voice.md` before writing any string. In short: plain, calm and brief, in the second person, in British English. Lead with the thing, give an error's next step, and use sentence case.

## Known gaps

Some of today's colours miss the rules above. `foundations.md` lists each one, with its measured contrast and whether the owner chose to keep it.
