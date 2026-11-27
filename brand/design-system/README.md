# Journal design system

> Purpose: the home of Journal's brand decisions: the app icon, the colour tokens and the
> mockups each visual change was decided on.

**Status:** formalised 2026-11-27. Published as a Design System artifact ([`SYSTEM.md`](SYSTEM.md)),
with component cards and a gate that runs in CI. How to change it: [`webapp/docs/brand.md`](../../webapp/docs/brand.md).

## 1. What is here

- `project/`: the artifact's source, at the paths it serves. `tokens.json` holds the colour roles
  (`canvas`, `panel`, `ink`, `ink-secondary`, `control-border`, `error-ink`, the accent roles, …),
  type, spacing, radius and shadow; `README.md`, `foundations.md` and `voice.md` are the brand
  book; `components/<Name>/` holds each card's README and preview; `design-system.json` is the
  index. The accent roles show the default violet; the per-user scales live in
  `webapp/src/assets/accents.css`.
- `checks.json`: the gate's settings. `scripts/check_design_system.py` (repo root) is the gate.
- `project/assets/AppIcon/`: the app icon's master SVGs, one pair per accent, written by
  `webapp`'s `npm run icon:gen` from `webapp/src/brand/app-icon.json`. Don't edit them by hand;
  `npm run icon:check` fails if they drift.
- `SYSTEM.md`: the artifact's URL.
- `mockups/<yymmdd>-<slug>/`: one folder per visual question. `index.html` is the page;
  `README.md` records the options, the owner's words and the decision. `dist/` is built by the
  design-system skill's `mockup.py build` and git-ignored.

## 2. Decisions so far

| Date | Question | Decision | Record |
| --- | --- | --- | --- |
| 2026-11-26 | App icon | Pen and paper, white on a tile in the user's accent colour (first fixed green, revised the same day) | [`mockups/261126-app-icon`](mockups/261126-app-icon/README.md) |
| 2026-11-26 | App accent | A per-user setting rather than one fixed colour | [`mockups/261126-app-accent`](mockups/261126-app-accent/README.md) |
| 2026-11-26 | Accent setting | Swatch row in Settings → Appearance; violet (default), green, emerald, blue, rose, graphite | [`mockups/261126-appearance-setting`](mockups/261126-appearance-setting/README.md) |
| 2026-11-27 | Form contrast | Control edges gray-500 (`control-border`), light error text red-800 (`error-ink`), a solid 2px accent focus ring | [`mockups/261127-form-contrast`](mockups/261127-form-contrast/README.md) |

How the roles and the accent work in code: `webapp/docs/architecture.md`, "Colour roles, typography
and contrast" and "Accent colour and app icon".
