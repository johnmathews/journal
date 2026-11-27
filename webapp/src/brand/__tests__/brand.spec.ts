/// <reference types="node" />
import { describe, it, expect, afterEach } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
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

/** Every Tailwind utility prefix that takes a colour. */
const COLOUR_PREFIXES = [
  'bg',
  'text',
  'border',
  'border-[xytrblse]',
  'ring',
  'ring-offset',
  'inset-ring',
  'outline',
  'divide',
  'placeholder',
  'fill',
  'stroke',
  'from',
  'via',
  'to',
  'decoration',
  'accent',
  'caret',
  'shadow',
  'inset-shadow',
  'drop-shadow',
  'text-shadow',
]

/**
 * A violet utility (with any variant chain, `dark:hover:bg-violet-500`, or `!` before it), or the
 * `--color-violet-N` theme variable a stylesheet would reach it through.
 */
const VIOLET = new RegExp(
  `(?:(?:^|[\\s"'\`:!\\]])(?:${COLOUR_PREFIXES.join('|')})-violet-\\d|--color-violet-\\d)`,
  'm',
)

/** The declarations inside the rule whose selector list contains `selector`. */
function block(css: string, selector: string): string {
  const rule = css.split('}').find((r) => r.split('{')[0].includes(selector))
  return rule ? rule.split('{')[1] : ''
}

type Rgb = [number, number, number]
const rgb = (hex: string): Rgb =>
  [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255) as Rgb
/** `fg` at `alpha` painted over `bg` (sRGB compositing, as the browser does). */
const over = (fg: Rgb, alpha: number, bg: Rgb): Rgb =>
  fg.map((c, i) => alpha * c + (1 - alpha) * bg[i]) as Rgb
function luminance(c: Rgb): number {
  const [r, g, b] = c.map((v) =>
    v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4,
  )
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}
/** WCAG contrast ratio. */
function contrast(a: Rgb, b: Rgb): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}

/** An accent's `--accent-<name>` value: its own block, else the default (violet) block's. */
function accentVar(id: string, name: string): string {
  const pattern = new RegExp(`--accent-${name}: ([^;]+);`)
  const own = pattern.exec(block(accentsCss, `:root[data-accent='${id}']`))
  const fallback = pattern.exec(
    block(accentsCss, `:root[data-accent='violet']`),
  )
  const value = (own ?? fallback)?.[1] ?? ''
  const ref = /^var\(--accent-([\w-]+)\)$/.exec(value)
  return ref ? accentVar(id, ref[1]) : value
}

describe("the writing heatmap's lowest step", () => {
  const heatmap = read('src/components/dashboard/CalendarHeatmap.vue')
  const gray = (step: number) =>
    rgb(new RegExp(`--color-gray-${step}: (#[0-9a-f]{6})`).exec(mainCss)![1])
  // The first bucket colour in BUCKET_COLOURS: `bg-accent-<light> dark:bg-accent-<step>/<alpha>`.
  const [, light, darkStep, darkAlpha] =
    /'bg-accent-([\w-]+) dark:bg-accent-(\d+)\/(\d+)', \/\/ ≤ p25/.exec(
      heatmap,
    )!
  // Empty days are gray-100 (light) / gray-700 (dark), on a white / gray-800 tile.
  const lightRatio = (id: string) =>
    contrast(rgb(accentVar(id, light)), gray(100))
  const darkRatio = (id: string) =>
    contrast(
      over(rgb(accentVar(id, darkStep)), Number(darkAlpha) / 100, gray(800)),
      gray(700),
    )

  it('graphite stands apart from an empty day in light and dark', () => {
    expect(lightRatio('graphite')).toBeGreaterThanOrEqual(1.3)
    expect(darkRatio('graphite')).toBeGreaterThanOrEqual(1.3)
  })

  it.each(ACCENTS.filter((a) => a.id !== 'graphite').map((a) => a.id))(
    '%s still uses its 200 on light',
    (id) => {
      expect(accentVar(id, light)).toBe(accentVar(id, '200'))
    },
  )
})

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

  describe('no leftover violet utility, which would ignore the setting', () => {
    it.each([
      'bg-violet-500',
      'text-violet-600',
      'dark:hover:border-l-violet-400',
      'group-hover:ring-offset-violet-300',
      'focus-visible:outline-violet-500/50',
      'divide-violet-100',
      'placeholder:text-violet-400',
      'placeholder-violet-400',
      'fill-violet-500',
      'stroke-violet-500',
      'from-violet-50 via-violet-100 to-violet-200',
      'decoration-violet-500',
      'accent-violet-500',
      'caret-violet-500',
      'shadow-violet-500/20',
      'inset-shadow-violet-500',
      'inset-ring-violet-500',
      'drop-shadow-violet-500',
      'text-shadow-violet-500',
      'border-x-violet-200',
      'border-s-violet-200',
      '!bg-violet-500',
      '@apply bg-violet-500;',
      'class="[&>svg]:fill-violet-500"',
      'background: var(--color-violet-500);',
    ])('catches %j', (sample) => {
      expect(sample).toMatch(VIOLET)
    })

    it.each([
      'bg-accent-500',
      ":root[data-accent='violet'] {",
      "accent: 'violet'",
      'violet-500 is the template colour',
    ])('lets %j through', (sample) => {
      expect(sample).not.toMatch(VIOLET)
    })

    it('in any view, component, script or stylesheet under src/', () => {
      const scripts = import.meta.glob(
        ['/src/**/*.{vue,ts}', '!/src/**/__tests__/**'],
        { query: '?raw', import: 'default', eager: true },
      ) as Record<string, string>
      expect(Object.keys(scripts).length).toBeGreaterThan(50)
      // Vitest blanks CSS imports, so stylesheets come off disk.
      const styles = Object.fromEntries(
        (readdirSync('src', { recursive: true }) as string[])
          .filter((path) => path.endsWith('.css'))
          .map((path) => [`/src/${path}`, read(`src/${path}`)]),
      )
      expect(Object.keys(styles)).toEqual(
        expect.arrayContaining([
          '/src/assets/main.css',
          '/src/assets/accents.css',
        ]),
      )
      const offenders = Object.entries({ ...scripts, ...styles })
        .filter(([, text]) => VIOLET.test(text))
        .map(([path]) => path)
      expect(offenders).toEqual([])
    })
  })
})

describe("index.html's pre-paint script", () => {
  // The inline (non-module) script: it runs before the app, so it can't import accents.ts and
  // carries its own copy of the ids.
  const script = /<script>([\s\S]*?)<\/script>/.exec(indexHtml)![1]
  const run = (cached: string | null) => {
    localStorage.clear()
    if (cached !== null) localStorage.setItem('accent', cached)
    delete document.documentElement.dataset.accent
    document.head.innerHTML =
      '<link rel="icon" href="/icons/violet/favicon.svg" data-icon="favicon.svg">'
    new Function(script)()
    return {
      accent: document.documentElement.dataset.accent,
      icon: document.querySelector('link[data-icon]')!.getAttribute('href'),
    }
  }

  afterEach(() => {
    localStorage.clear()
    delete document.documentElement.dataset.accent
  })

  it('lists exactly the ids in accents.ts', () => {
    const list = /var accents = \[([^\]]*)\]/.exec(script)
    expect(list, 'var accents = [...] in index.html').not.toBeNull()
    const ids = [...list![1].matchAll(/'([^']+)'/g)].map((m) => m[1])
    expect(ids).toEqual(ACCENTS.map((a) => a.id))
  })

  it.each(ACCENTS.map((a) => a.id))('applies a cached %s', (id) => {
    expect(run(id)).toEqual({
      accent: id,
      icon: `${iconDir(id)}/favicon.svg`,
    })
  })

  it.each([['chartreuse'], ['violetx'], ['']])(
    'leaves an unknown cached id (%j) on the violet default',
    (id) => {
      expect(run(id)).toEqual({
        accent: undefined,
        icon: `${iconDir(DEFAULT_ACCENT)}/favicon.svg`,
      })
    },
  )
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
