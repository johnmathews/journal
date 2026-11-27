# App icon and the accent-colour setting

> Purpose: why Journal got a pen-and-paper icon and a per-user accent colour, and the calls made
> on the way.

## 1. Starting point

The webapp had no icon. `index.html` linked a `/favicon.ico` that did not exist, and nginx's SPA
fallback answered it with `index.html`. The sidebar showed only the text "JOURNAL INSIGHTS TOOL",
and nothing at all when the desktop sidebar collapsed. The violet accent was the Mosaic admin
template's, not a decision.

## 2. Decisions (owner, 2026-11-26)

Each was picked on a published mockup; the records are in `brand/design-system/mockups/261126-*`.

- **Mark:** E, a ruled page with a pen writing its last line. Rounds: A (page and spark), B
  (handwritten j), C (lines into a trend); then D (pen nib) and E (pen and paper) on request.
- **Icon colour:** first green `#15803d`, fixed. Revised after the owner tried the build: the
  icon follows the accent, because a fixed colour made no sense once the rest of the app could
  change.
- **Accent:** not one fixed colour but a setting. Violet stays the default and stays exactly as
  it was, its two contrast misses included (white button text 3.7:1, light links 4.4:1), by the
  owner's choice. Offered: violet, green, emerald, blue, rose, graphite.
- **Picker:** a row of swatches in a new Settings → Appearance tab; the page is the preview.

## 3. How it is built

- `src/brand/app-icon.json` holds the mark's geometry and `src/brand/appIcon.ts` the builders,
  which Node 22 imports directly (type stripping), so the generator, app and tests share one
  implementation. `AppLogo.vue` fills the tile with `accent-500`. `scripts/app-icon.mjs` writes a
  favicon, PNG and manifest set per accent under `public/icons/<id>/`; `icon:check` (CI,
  pre-push) fails on drift. Modelled on Tracker's `app_icon.py`.
- Static icon files can't know the user. `index.html` links the violet set with `data-icon`
  attributes; the pre-paint script and the store point them at the user's set. A home-screen icon
  is copied when it is added, so it keeps the colour it had then.
- All 400-odd `violet-N` utilities in 60 files became `accent-N`, mapped with `@theme inline`
  onto per-accent CSS variables switched by `data-accent` on `<html>`.
- **`accent-fg`, the one non-obvious call.** About 65 foreground uses of violet-500 (links,
  spinners, checkboxes, focus rings, input borders) had no `dark:` variant: violet's mid-tone 500
  reads at 4.0:1 on the dark panel. The new accents' 500s are dark enough for white button text,
  which makes them too dark on a dark panel (green 2.9:1). One colour cannot do both: for any
  colour, white-on-it times it-on-gray-800 is a constant 14.8, so the best compromise is about
  3.85:1 each way. Those uses became `accent-fg`: 500 in light; in dark, 400 for the new accents
  and 500 for violet, so violet renders identically.
- The preference is the free-form `accent` key on `PATCH /api/users/me/preferences`; no server
  or contract change. A `localStorage` copy, applied by an inline script in `index.html`, avoids a
  violet flash before the preference loads. Sign-out resets to violet.
- Chart series colours stay fixed: they are data colours, not the accent.

## 4. Gotchas met

- SVG `<use>` clones live in a shadow tree, so a selector like `.mark .t` never matches inside
  it; style the cloned classes directly.
- Vitest blanks every `.css` import, `?raw` included; the brand test reads the stylesheets from
  disk. `import.meta.url` is not a `file:` URL under happy-dom, so it reads relative to
  `process.cwd()`.
- Tailwind v4 scans Markdown too, so `bg-violet-500` in docs still emits an unused rule. Harmless.

## 5. Next

Formalise the design system from today's look (`brand/design-system/`): tokens, a published
Design System artifact, the gate, and `docs/brand.md`. Owner's brief: align and formalise what is
there, no large visual changes.
