// The design system's colour roles as CSS variables for the app, generated from
// brand/design-system/project/tokens.json (scripts/tokens.mjs writes src/assets/tokens.css; a
// test fails when the committed file is stale). Node imports this file directly, like appIcon.ts.
//
// Only colours: tokens.json's radius, spacing, shadow and type names (--radius-lg, .body, …)
// would override Tailwind's own variables of the same names. The accent roles are left out too:
// accents.css derives them from the user's accent scale, so they follow Settings → Appearance.

export interface ColourToken {
  name: string
  value: { light: string; dark: string }
  usage: string
}

export interface Tokens {
  color: { tokens: ColourToken[] }
}

/** Roles that accents.css sets from the live accent scale instead. */
export const LIVE_TOKENS: readonly string[] = [
  'accent',
  'accent-hover',
  'accent-fg',
  'accent-tint',
  'accent-tint-ink',
  'focus',
]

export function tokensCss(tokens: Tokens): string {
  const fixed = tokens.color.tokens.filter((t) => !LIVE_TOKENS.includes(t.name))
  const decls = (theme: 'light' | 'dark') =>
    fixed.map((t) => `  --${t.name}: ${t.value[theme]};`).join('\n')
  return [
    '/* Generated from brand/design-system/project/tokens.json by `npm run tokens:gen`. Do not edit. */',
    ':root {',
    decls('light'),
    '}',
    '',
    '.dark {',
    decls('dark'),
    '}',
    '',
  ].join('\n')
}
