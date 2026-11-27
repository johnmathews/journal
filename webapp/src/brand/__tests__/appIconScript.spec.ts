/// <reference types="node" />
import { describe, it, expect } from 'vitest'
import { spawnSync } from 'node:child_process'
import { readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

// scripts/app-icon.mjs, run the way `npm run icon:gen` runs it. Vitest's root is webapp/.
const WEBAPP = process.cwd()
const SCRIPT = join(WEBAPP, 'scripts/app-icon.mjs')
const ASSETS = join(WEBAPP, '../brand/design-system/project/assets/AppIcon')

/** Modification time of every text file icon:gen writes (and the folders it writes into). */
function writtenFiles(): Map<string, number> {
  const files = new Map<string, number>()
  const add = (path: string) => files.set(path, statSync(path).mtimeMs)
  for (const name of readdirSync(ASSETS)) add(join(ASSETS, name))
  add(join(WEBAPP, 'public/favicon.svg'))
  add(join(WEBAPP, 'public/manifest.webmanifest'))
  const icons = join(WEBAPP, 'public/icons')
  for (const id of readdirSync(icons)) {
    for (const name of ['favicon.svg', 'manifest.webmanifest']) {
      add(join(icons, id, name))
    }
  }
  return files
}

describe('npm run icon:gen', () => {
  it('writes nothing when rsvg-convert and ImageMagick are missing', () => {
    const before = writtenFiles()
    // An empty PATH hides rsvg-convert and magick; node itself is run by absolute path.
    const run = spawnSync(process.execPath, [SCRIPT], {
      cwd: WEBAPP,
      env: { PATH: '' },
      encoding: 'utf8',
    })
    expect(run.status).toBe(1)
    expect(run.stderr).toContain('rsvg-convert')
    expect(run.stderr).toContain('magick')
    expect(run.stderr).toContain('nothing written')
    expect(writtenFiles()).toEqual(before)
  })

  it('--check needs neither tool', () => {
    const run = spawnSync(process.execPath, [SCRIPT, '--check'], {
      cwd: WEBAPP,
      env: { PATH: '' },
      encoding: 'utf8',
    })
    expect(run.status).toBe(0)
  })
})
