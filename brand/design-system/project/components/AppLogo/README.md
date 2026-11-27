# AppLogo

Journal's mark: a ruled page with a pen writing its last line, white on a rounded tile in the user's accent colour.

## Use

- Beside the title in the sidebar, at 32px. It stays when the desktop sidebar collapses and the title hides.
- The favicon, the home-screen icon and the web manifest are built from the same geometry, one set per accent.
- Don't put it anywhere else as decoration. It names the app.

## What the consumer provides

- In the Vue app: `<AppLogo class="w-8 h-8 shrink-0" />` (`src/components/layout/AppLogo.vue`). It sizes to its box and fills its tile with `accent-500`, so it recolours with Settings → Appearance.
- The geometry lives in `src/brand/app-icon.json`, and `src/brand/appIcon.ts` builds the SVGs. Change the mark there, then run `npm run icon:gen`. `npm run icon:check` fails if the files drift.
- The master SVGs in `assets/AppIcon/` are generated. Don't edit them by hand.

## States

- One state per accent: violet (the default), green, emerald, blue, rose and graphite.
- The glyph is always white. The pen's outline and bands are cut in the tile's colour, so the pen reads against the page lines.

## Do and don't

- Do keep the tile square with its 7-unit corner radius on the 32-unit grid.
- Don't recolour the glyph, add a border or a shadow, or set the mark on a fill of the same accent.
- A home-screen icon is copied when it is added, so it keeps the accent it had then. That is expected.
