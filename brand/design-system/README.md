# Journal design system

> Purpose: the home of Journal's brand decisions: the app icon, the colour tokens and the
> mockups each visual change was decided on.

**Status:** started 2026-11-26. It records today's look; it does not yet hold a published Design
System artifact, component cards or a gate. Formalising those is the next step.

## 1. What is here

- `project/tokens.json`: today's colours, type and spacing under the standard role names
  (`canvas`, `panel`, `ink`, `ink-secondary`, `accent`, …). Values are the Mosaic shell's,
  unchanged. `accent` holds the default violet; the per-user accent scales live in
  `webapp/src/assets/accents.css`.
- `project/assets/AppIcon/`: the app icon's master SVGs, one pair per accent, written by
  `webapp`'s `npm run icon:gen` from `webapp/src/brand/app-icon.json`. Don't edit them by hand;
  `npm run icon:check` fails if they drift.
- `mockups/<yymmdd>-<slug>/`: one folder per visual question. `index.html` is the page;
  `README.md` records the options, the owner's words and the decision. `dist/` is built by the
  design-system skill's `mockup.py build` and git-ignored.

## 2. Decisions so far

| Date | Question | Decision | Record |
| --- | --- | --- | --- |
| 2026-11-26 | App icon | Pen and paper, white on a tile in the user's accent colour (first fixed green, revised the same day) | [`mockups/261126-app-icon`](mockups/261126-app-icon/README.md) |
| 2026-11-26 | App accent | A per-user setting rather than one fixed colour | [`mockups/261126-app-accent`](mockups/261126-app-accent/README.md) |
| 2026-11-26 | Accent setting | Swatch row in Settings → Appearance; violet (default), green, emerald, blue, rose, graphite | [`mockups/261126-appearance-setting`](mockups/261126-appearance-setting/README.md) |

How the accent works in code: `webapp/docs/architecture.md`, "Accent colour and app icon".
