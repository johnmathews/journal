#!/usr/bin/env node
// Writes Journal's app icon set, one per accent colour, from src/brand/app-icon.json and the
// accents in src/brand/accents.ts (Node imports the .ts files directly; Node 22.18+).
//
//   npm run icon:gen     write the SVGs and manifests, then the PNGs and .ico files
//   npm run icon:check   exit 1 when a committed SVG or manifest is stale (CI runs this)
//
// public/icons/<accent>/ holds each accent's set; stores/appearance.ts points the page's icon
// links at the user's. The root files (favicon.ico, favicon.svg, apple-touch-icon.png,
// manifest.webmanifest) are the default accent's, for requests made before the app runs.
// Writing the PNGs and .ico files needs rsvg-convert and ImageMagick
// (`brew install librsvg imagemagick`); icon:gen checks for both before it writes anything, so a
// missing tool leaves the set as it was. --check needs neither.

import { execFileSync } from 'node:child_process'
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  APP_SCALE,
  MASKABLE_SCALE,
  appSvg,
  faviconSvg,
  manifest,
} from '../src/brand/appIcon.ts'
import { ACCENTS, DEFAULT_ACCENT } from '../src/brand/accents.ts'

const WEBAPP = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const REPO = resolve(WEBAPP, '..')
const PUBLIC = join(WEBAPP, 'public')
const ASSETS = join(REPO, 'brand/design-system/project/assets/AppIcon')
const icon = JSON.parse(
  readFileSync(join(WEBAPP, 'src/brand/app-icon.json'), 'utf8'),
)
const dirOf = (id) => join(PUBLIC, 'icons', id)
const fallback = ACCENTS.find((a) => a.id === DEFAULT_ACCENT)

/** Every text file this script owns, with the content it should have. */
export function sources() {
  const files = {}
  for (const { id, swatch } of ACCENTS) {
    files[join(dirOf(id), 'favicon.svg')] = faviconSvg(icon, swatch)
    files[join(dirOf(id), 'manifest.webmanifest')] = manifest(icon, id, swatch)
    files[join(ASSETS, `journal-icon-${id}.svg`)] = appSvg(
      icon,
      swatch,
      APP_SCALE,
    )
    files[join(ASSETS, `journal-icon-maskable-${id}.svg`)] = appSvg(
      icon,
      swatch,
      MASKABLE_SCALE,
    )
  }
  files[join(PUBLIC, 'favicon.svg')] = faviconSvg(icon, fallback.swatch)
  files[join(PUBLIC, 'manifest.webmanifest')] = manifest(
    icon,
    fallback.id,
    fallback.swatch,
  )
  return files
}

/** The raster tools rasterise() runs. */
const RASTER_TOOLS = ['rsvg-convert', 'magick']

/** The raster tools that can't be run from this PATH. */
function missingTools() {
  return RASTER_TOOLS.filter((cmd) => {
    try {
      execFileSync(cmd, ['--version'], { stdio: 'ignore' })
      return false
    } catch {
      return true
    }
  })
}

function rasterise() {
  const run = (cmd, args) => execFileSync(cmd, args, { stdio: 'inherit' })
  const png = (svg, out, px) =>
    run('rsvg-convert', ['-w', String(px), '-h', String(px), '-o', out, svg])
  for (const { id } of ACCENTS) {
    const dir = dirOf(id)
    const master = join(ASSETS, `journal-icon-${id}.svg`)
    png(master, join(dir, 'apple-touch-icon.png'), 180)
    png(master, join(dir, 'icon-192.png'), 192)
    png(master, join(dir, 'icon-512.png'), 512)
    png(
      join(ASSETS, `journal-icon-maskable-${id}.svg`),
      join(dir, 'icon-maskable-512.png'),
      512,
    )
    // favicon.ico: 16, 32 and 48px, for whatever prefers it to the SVG.
    const tmp = [16, 32, 48].map((px) => [px, join(dir, `.favicon-${px}.png`)])
    for (const [px, out] of tmp) png(join(dir, 'favicon.svg'), out, px)
    run('magick', [...tmp.map(([, out]) => out), join(dir, 'favicon.ico')])
    for (const [, out] of tmp) unlinkSync(out)
  }
  for (const name of ['favicon.ico', 'apple-touch-icon.png']) {
    copyFileSync(join(dirOf(DEFAULT_ACCENT), name), join(PUBLIC, name))
  }
}

function main() {
  const check = process.argv.includes('--check')
  const files = sources()
  const stale = Object.entries(files)
    .filter(
      ([path, text]) =>
        !existsSync(path) || readFileSync(path, 'utf8') !== text,
    )
    .map(([path]) => path)
  if (check) {
    for (const path of stale) {
      console.log(
        `stale: ${relative(REPO, path)} (run npm run icon:gen in webapp/)`,
      )
    }
    return stale.length ? 1 : 0
  }
  const missing = missingTools()
  if (missing.length) {
    console.error(
      `app-icon: ${missing.join(' and ')} not found, nothing written (brew install librsvg imagemagick)`,
    )
    return 1
  }
  mkdirSync(ASSETS, { recursive: true })
  for (const { id } of ACCENTS) mkdirSync(dirOf(id), { recursive: true })
  for (const [path, text] of Object.entries(files)) writeFileSync(path, text)
  rasterise()
  console.log(
    `app-icon: wrote ${Object.keys(files).length} SVG and manifest files, and the PNG and .ico files, for ${ACCENTS.length} accents`,
  )
  return 0
}

process.exitCode = main()
