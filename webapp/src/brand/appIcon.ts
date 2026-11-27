// Builds the app icon's SVGs and web manifest from src/brand/app-icon.json: the pen-and-paper
// mark, a white glyph on a tile in the user's accent colour (brand/design-system/mockups/
// 261126-app-icon). Shared by scripts/app-icon.mjs (Node imports this file directly, so it must
// stay plain, type-strippable TypeScript with no imports), the app (stores/appearance.ts points
// the icon links at the accent's set) and the tests.

export interface AppIcon {
  name: string
  glyph: string
  radius: number
  page: {
    x: number
    y: number
    width: number
    height: number
    rx: number
    stroke: number
  }
  lines: { d: string; stroke: string | number }
  pen: {
    transform: string
    body: string
    knockout: number
    bands: string
    bandStroke: number
  }
  centre: { x: number; y: number }
}

/** Fills the 100-unit home-screen icon to about 62%. */
export const APP_SCALE = 2.4
/** Keeps the glyph inside a maskable icon's safe circle (80%). */
export const MASKABLE_SCALE = 2.1

/** Where an accent's icon set is served from: public/icons/<id>/. */
export function iconDir(accent: string): string {
  return `/icons/${accent}`
}

/** The glyph on the icon's 32-unit grid: a ruled page and a pen writing its last line. */
export function glyph(icon: AppIcon, tile: string): string {
  const { page, lines, pen, glyph: ink } = icon
  const line = 'fill="none" stroke-linecap="round" stroke-linejoin="round"'
  return (
    `<rect x="${page.x}" y="${page.y}" width="${page.width}" height="${page.height}" rx="${page.rx}" ` +
    `${line} stroke="${ink}" stroke-width="${page.stroke}"/>` +
    `<path d="${lines.d}" ${line} stroke="${ink}" stroke-width="${lines.stroke}"/>` +
    `<g transform="${pen.transform}">` +
    `<path d="${pen.body}" fill="${ink}" stroke="${tile}" stroke-width="${pen.knockout}" ` +
    `stroke-linejoin="round" paint-order="stroke"/>` +
    `<path d="${pen.bands}" fill="none" stroke="${tile}" stroke-width="${pen.bandStroke}"/></g>`
  )
}

/** The browser-tab icon: a rounded tile on the 32-unit grid. */
export function faviconSvg(icon: AppIcon, tile: string): string {
  return (
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">' +
    `<rect width="32" height="32" rx="${icon.radius}" fill="${tile}"/>` +
    `${glyph(icon, tile)}</svg>\n`
  )
}

/** A square home-screen icon on a 100-unit grid; the phone rounds the corners. */
export function appSvg(icon: AppIcon, tile: string, scale: number): string {
  const tx = round(50 - icon.centre.x * scale)
  const ty = round(50 - icon.centre.y * scale)
  return (
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">' +
    `<rect width="100" height="100" fill="${tile}"/>` +
    `<g transform="translate(${tx} ${ty}) scale(${scale})">${glyph(icon, tile)}</g></svg>\n`
  )
}

/** The web app manifest for one accent: its icons, and the tile as the theme colour. */
export function manifest(icon: AppIcon, accent: string, tile: string): string {
  const dir = iconDir(accent)
  const body = {
    name: icon.name,
    short_name: icon.name,
    start_url: '/',
    display: 'standalone',
    icons: [
      { src: `${dir}/icon-192.png`, sizes: '192x192', type: 'image/png' },
      { src: `${dir}/icon-512.png`, sizes: '512x512', type: 'image/png' },
      {
        src: `${dir}/icon-maskable-512.png`,
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
    background_color: tile,
    theme_color: tile,
  }
  return JSON.stringify(body, null, 2) + '\n'
}

function round(n: number): number {
  return Math.round(n * 1000) / 1000
}
