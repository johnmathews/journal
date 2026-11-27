/// <reference types="node" />
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { mount } from '@vue/test-utils'
import { ACCENTS, DEFAULT_ACCENT, isAccentId } from '@/brand/accents'
import icon from '@/brand/app-icon.json'
import AppLogo from '@/components/layout/AppLogo.vue'
import { faviconSvg, iconDir, manifest } from '@/brand/appIcon'
import indexHtml from '../../../index.html?raw'

// Vitest blanks CSS imports (even ?raw), so files are read from disk; its root is webapp/.
const read = (path: string) => readFileSync(`${process.cwd()}/${path}`, 'utf8')
const accentsCss = read('src/assets/accents.css')
const mainCss = read('src/assets/main.css')

const STEPS = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950]

/** The declarations inside the rule whose selector list contains `selector`. */
function block(css: string, selector: string): string {
  const rule = css.split('}').find((r) => r.split('{')[0].includes(selector))
  return rule ? rule.split('{')[1] : ''
}

describe('accent colours', () => {
  const css = accentsCss

  it('violet is the default and the first choice', () => {
    expect(DEFAULT_ACCENT).toBe('violet')
    expect(ACCENTS[0].id).toBe('violet')
  })

  it.each(ACCENTS.map((a) => [a.id, a.swatch]))(
    '%s has a full scale in accents.css, and its swatch is its 500',
    (id, swatch) => {
      const decls = block(css, `:root[data-accent='${id}']`)
      for (const step of STEPS) {
        expect(decls, `--accent-${step} for ${id}`).toMatch(
          new RegExp(`--accent-${step}: #[0-9a-f]{6};`),
        )
      }
      expect(decls).toContain(`--accent-500: ${swatch};`)
    },
  )

  it('every accent except violet draws dark-mode foregrounds from its 400', () => {
    const dark = css.slice(css.indexOf(":root.dark[data-accent='green']"))
    for (const { id } of ACCENTS) {
      const listed = dark.includes(`:root.dark[data-accent='${id}']`)
      expect(listed, id).toBe(id !== 'violet')
    }
  })

  it('isAccentId accepts only the listed ids', () => {
    expect(isAccentId('graphite')).toBe(true)
    expect(isAccentId('chartreuse')).toBe(false)
    expect(isAccentId(undefined)).toBe(false)
  })

  it('no view or component uses a violet utility, which would ignore the setting', () => {
    const sources = import.meta.glob(
      ['/src/**/*.{vue,ts}', '!/src/**/__tests__/**'],
      {
        query: '?raw',
        import: 'default',
        eager: true,
      },
    ) as Record<string, string>
    expect(Object.keys(sources).length).toBeGreaterThan(50)
    const violet =
      /(?:^|[\s"'`:])(?:bg|text|border|ring|outline|from|to|via|fill|stroke)-violet-\d/
    const offenders = Object.entries(sources)
      .filter(([, text]) => violet.test(text))
      .map(([path]) => path)
    expect(offenders).toEqual([])
    expect(mainCss).not.toMatch(/--color-violet-\d+/)
  })
})

describe('app icon', () => {
  it.each(ACCENTS.map((a) => [a.id, a.swatch]))(
    'the committed %s icon set is current (npm run icon:gen)',
    (id, swatch) => {
      const dir = `public${iconDir(id)}`
      expect(read(`${dir}/favicon.svg`)).toBe(faviconSvg(icon, swatch))
      expect(read(`${dir}/manifest.webmanifest`)).toBe(
        manifest(icon, id, swatch),
      )
      expect(read(`${dir}/favicon.svg`)).toContain(`fill="${swatch}"`)
    },
  )

  it("the root favicon and manifest are the default accent's", () => {
    const fallback = ACCENTS.find((a) => a.id === DEFAULT_ACCENT)!
    expect(read('public/favicon.svg')).toBe(faviconSvg(icon, fallback.swatch))
    expect(read('public/manifest.webmanifest')).toBe(
      manifest(icon, fallback.id, fallback.swatch),
    )
  })

  it('index.html links the default set, marked so the app can swap it', () => {
    for (const file of [
      'favicon.ico',
      'favicon.svg',
      'apple-touch-icon.png',
      'manifest.webmanifest',
    ]) {
      expect(indexHtml).toContain(`href="${iconDir(DEFAULT_ACCENT)}/${file}"`)
      expect(indexHtml).toContain(`data-icon="${file}"`)
    }
  })

  it("AppLogo draws the favicon's mark on an accent-coloured tile", () => {
    const svg = mount(AppLogo).find('svg')
    expect(svg.attributes('aria-hidden')).toBe('true')
    const html = svg.html()
    for (const part of [
      icon.lines.d,
      icon.pen.body,
      icon.pen.bands,
      icon.pen.transform,
    ]) {
      expect(html).toContain(part)
    }
    const tile = svg.find('[data-testid="app-logo-tile"]')
    expect(tile.classes()).toContain('fill-accent-500')
    expect(tile.attributes('fill')).toBeUndefined()
  })
})
