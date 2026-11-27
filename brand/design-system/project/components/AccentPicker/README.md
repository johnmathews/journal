# AccentPicker

The accent picker lets each person choose the app's accent colour: a row of six swatches in Settings → Appearance, saved to their account.

## Use

- Only in Settings → Appearance. The page itself is the preview: it recolours as soon as a swatch is picked.
- The six accents are violet (the default, unchanged from the Mosaic template), green, emerald, blue, rose and graphite. Decided 2026-11-26 (`mockups/261126-appearance-setting`).
- The choice recolours buttons, links, the active nav item, selected items, focus rings and the app icon. Chart series colours stay fixed: they are data colours.

## What the consumer provides

- `<AppearanceSettings />` (`src/components/settings/AppearanceSettings.vue`), which reads the list from `src/brand/accents.ts` and saves through the appearance store as the `accent` user preference.
- To add an accent: an entry in `accents.ts`, a `:root[data-accent='…']` scale in `src/assets/accents.css` whose 500 carries white at 4.5:1 or better, its icon set (`npm run icon:gen`), and a mockup first.

## States

- **Selected:** a 2px gap in `panel` and a 2px ring in the swatch's own colour. The name turns `ink` and semibold.
- **Focus:** a 2px `ink` outline 4px off the swatch, so the ring never blends into the colour it surrounds. This is the one focus ring in the app that is not the accent.
- **Status:** "Saving…", then "Saved" in `ink-secondary`. A failed save shows its message in `error-ink` and goes back to the last accent the account confirmed.

## Do and don't

- Do keep a name under every swatch. Colour alone doesn't say what it is.
- Don't offer an accent whose 500 can't carry white text at 4.5:1. Violet is the one exception, kept by the owner's choice.
