# Design system formalised

> Purpose: how Journal's look became a published design system with a gate, and the calls made
> on the way.

## 1. Brief

Owner, 2026-11-27: formalise the design system from today's look, with no large visual changes.
Deliverables: role-named tokens, the gate in CI, a published Design System artifact, and
`webapp/docs/brand.md`. It builds on PR #56 (the app icon and the per-user accent).

## 2. What was built

- **Tokens.** `brand/design-system/project/tokens.json` holds the standard colour roles with
  today's Mosaic values. It adds status roles (error, success and warning ink and surface), the
  accent roles, Inter's six text styles as the app sets them, spacing, radius (corrected:
  `radius-lg` is 12px for cards, `radius-xl` 16px for the sign-in card) and two shadows.
- **App.** `npm run tokens:gen` writes `webapp/src/assets/tokens.css`, colours only, and
  `main.css` maps every role to a Tailwind colour (`bg-panel`, `text-ink-secondary`, …).
- **Gate.** `scripts/check_design_system.py` and `design_preview.py` are copied from the skill
  (version 1). `.github/workflows/design-system.yml` runs the gate with `--complete`, and so does
  the pre-push hook. Webapp CI runs `tokens:check`.
- **Artifact.** https://claude.ai/artifact/B5VfW1xyBSaB71AQv8uBDL holds the README, foundations,
  voice, 14 component cards, a cover and the 12 app icon masters as uploads.
- **Docs.** `webapp/docs/brand.md`, plus a rewritten contrast section in `architecture.md` and
  lines in both CLAUDE.md files.

## 3. Decisions

- **Form contrast**, decided on `mockups/261127-form-contrast` (all three B). Inputs, selects,
  checkboxes and radios get gray-500 edges (1.2:1 before, 4.8:1 after on white). Light-mode error
  text goes from red-700 to red-800 (3.6:1 to 4.9:1 in its alert box). Every `:focus-visible` gets
  a solid 2px accent ring at a 2px offset, where before most controls had the browser default and
  inputs only darkened their border.
- **Known misses kept.** Violet's two misses stay by the earlier choice. Warning text (2.6:1), the
  success and error toasts (3.8, 3.4:1), the danger button (2.9:1), placeholders (2.5:1) and the
  red remove icons (2.6:1) are listed in `foundations.md` and left for their own mockup, since the
  brief ruled out more visible change.
- **The 2,400 `gray-N` uses stay.** They render the role values. Sweeping them is a large diff
  with no visible gain, so they move when a screen is next touched.

## 4. Gotchas

- **The skill's generic `tokens.css` can't go into this app.** Its `--radius-lg` (12px) overrides
  Tailwind's variable of the same name, which would turn every `rounded-lg` from 8px to 12px. Its
  `.body` and `.label` classes would also collide. The app's generator (`src/brand/tokens.ts`)
  writes colours only.
- **Accent roles must not be fixed in tokens.css.** A `:root { --accent-fg: … }` imported after
  `accents.css` would pin violet over a light green accent. The generator leaves the accent roles
  out, and `accents.css` derives them from the live scale. A test checks both.
- **The forms plugin's `[type='text']:focus { outline: 2px solid transparent }`** outranks a plain
  `:focus-visible`, so the global rule uses `:is(*, [type][type]):focus-visible`, and the form
  classes add the ring in the components layer as well.
- **Uploaded SVGs are stored at 755 bytes** where the local files are 726. The server normalises
  them, and the index records the stored size.

## 5. Next

- A mockup for the status colours left open in `foundations.md`.
- Republish the artifact's changed files after any merge that touches `brand/design-system/`.
