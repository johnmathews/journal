/// <reference types="node" />
import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { LIVE_TOKENS, tokensCss, type Tokens } from '@/brand/tokens'

// Vitest blanks CSS imports, so stylesheets are read from disk; its root is webapp/.
const read = (path: string) => readFileSync(`${process.cwd()}/${path}`, 'utf8')
const tokens: Tokens = JSON.parse(
  read('../brand/design-system/project/tokens.json'),
)
const roles: string[] = tokens.color.tokens.map((t) => t.name)
const mainCss = read('src/assets/main.css')
const accentsCss = read('src/assets/accents.css')
const patternsCss = read('src/assets/utility-patterns.css')

/** The declarations inside the rule whose selector list contains `selector`. */
function block(css: string, selector: string): string {
  const rule = css.split('}').find((r) => r.split('{')[0].includes(selector))
  return rule ? rule.split('{')[1] : ''
}

describe('design-system tokens in the app', () => {
  it('the committed tokens.css is generated from tokens.json (npm run tokens:gen)', () => {
    expect(read('src/assets/tokens.css')).toBe(tokensCss(tokens))
  })

  it('tokens.css holds every fixed colour role, light on :root and dark on .dark', () => {
    const css = tokensCss(tokens)
    for (const t of tokens.color.tokens) {
      if (LIVE_TOKENS.includes(t.name)) continue
      expect(block(css, ':root')).toContain(`--${t.name}: ${t.value.light};`)
      expect(block(css, '.dark')).toContain(`--${t.name}: ${t.value.dark};`)
    }
  })

  it('leaves out radius, spacing and type, whose names would override Tailwind', () => {
    const css = tokensCss(tokens)
    expect(css).not.toMatch(/--radius-|--space-|--shadow-|\.body|\.label/)
  })

  it('the accent roles come from the live scale in accents.css, not fixed values', () => {
    const css = tokensCss(tokens)
    for (const name of LIVE_TOKENS) {
      expect(roles, name).toContain(name)
      expect(css, name).not.toContain(`--${name}:`)
      expect(accentsCss, name).toMatch(new RegExp(`--${name}: var\\(--accent-`))
    }
  })

  it('main.css imports tokens.css before accents.css', () => {
    const tokensAt = mainCss.indexOf("@import './tokens.css'")
    expect(tokensAt).toBeGreaterThan(-1)
    expect(tokensAt).toBeLessThan(mainCss.indexOf("@import './accents.css'"))
  })

  it.each(roles)('%s is a Tailwind colour utility', (name: string) => {
    expect(mainCss).toContain(`--color-${name}: var(--${name});`)
  })
})

/** The declarations of the rule whose whole selector list is exactly `selector`. */
function rule(css: string, selector: string): string {
  const found = css
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('}')
    .find((r) => r.split('{')[0].trim() === selector)
  return found ? found.split('{')[1] : ''
}

describe('form contrast (mockups/261127-form-contrast, 1B 2B 3B)', () => {
  it('form controls have a control-border edge and an accent border when focused', () => {
    const inputs = rule(
      patternsCss,
      '.form-input,\n.form-textarea,\n.form-multiselect,\n.form-select',
    )
    expect(inputs).toContain('border-control-border')
    expect(inputs).toContain('focus:border-accent-fg')
    expect(inputs).not.toMatch(/(?<![:\w-])border-gray-/) // hover may darken
    // The checkbox and radio rule: the one that fills them with the accent when checked.
    const boxes = rule(patternsCss, '.form-checkbox,\n.form-radio')
    expect(boxes).toContain('checked:bg-accent-500')
    expect(boxes).toContain('border-control-border')
  })

  it('every keyboard focus draws a solid 2px ring in the focus colour, 2px off the edge', () => {
    const rule = block(mainCss, ':focus-visible')
    expect(rule).toContain('outline: 2px solid var(--focus);')
    expect(rule).toContain('outline-offset: 2px;')
    expect(patternsCss).toContain(
      'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-fg',
    )
  })

  /** Every .vue and .ts file under src/, tests excluded. */
  function sources(dir = `${process.cwd()}/src`): string[] {
    return readdirSync(dir).flatMap((name) => {
      const path = join(dir, name)
      if (statSync(path).isDirectory())
        return name === '__tests__' ? [] : sources(path)
      return /\.(vue|ts)$/.test(name) ? [path] : []
    })
  }

  it('light-mode error text uses text-error-ink, never a raw red step', () => {
    // A red foreground without a variant prefix is light-mode text: it must be error-ink.
    // Icon buttons in text-red-400 and the diff highlight's red-900 on red-100 are not error text.
    const raw = /(?<![\w:!-])!?text-red-(500|600|700|800)(?![\w/-])/g
    const hits = sources().flatMap((path) =>
      [...readFileSync(path, 'utf8').matchAll(raw)].map(
        (m) => `${path.slice(process.cwd().length + 1)}: ${m[0]}`,
      ),
    )
    expect(hits).toEqual([])
  })

  it('form controls carry no pale gray border utilities that would beat control-border', () => {
    const tag = /<(input|select|textarea)\b([^>]*?)\/?>/gs
    const hits = sources()
      .filter((p) => p.endsWith('.vue'))
      .flatMap((path) =>
        [...readFileSync(path, 'utf8').matchAll(tag)]
          .filter((m) => /(?<![:\w-])class="[^"]*\bborder-gray-\d/.test(m[2]))
          .map((m) => `${path.slice(process.cwd().length + 1)}: <${m[1]}>`),
      )
    expect(hits).toEqual([])
  })
})
