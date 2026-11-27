#!/usr/bin/env node
// Writes src/assets/tokens.css, the design system's colour roles as CSS variables, from
// brand/design-system/project/tokens.json (Node imports the .ts file directly; Node 22.18+).
//
//   npm run tokens:gen     write the file
//   npm run tokens:check   exit 1 when the committed file is stale (CI and pre-push run this)

import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { tokensCss } from '../src/brand/tokens.ts'

const WEBAPP = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const SOURCE = join(WEBAPP, '../brand/design-system/project/tokens.json')
const TARGET = join(WEBAPP, 'src/assets/tokens.css')

const css = tokensCss(JSON.parse(readFileSync(SOURCE, 'utf8')))

if (process.argv.includes('--check')) {
  let current = ''
  try {
    current = readFileSync(TARGET, 'utf8')
  } catch {
    // missing: stale
  }
  if (current !== css) {
    console.error(
      'tokens:check: src/assets/tokens.css is stale. Run `npm run tokens:gen`.',
    )
    process.exit(1)
  }
  console.log('tokens:check: src/assets/tokens.css is current.')
} else {
  writeFileSync(TARGET, css)
  console.log('tokens:gen: wrote src/assets/tokens.css')
}
