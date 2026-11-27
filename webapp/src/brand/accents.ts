// The accent colours a user can pick in Settings → Appearance. Each id has a block of
// `--accent-*` variables in src/assets/accents.css, and index.html's pre-paint script carries a
// copy of the ids (tests check both agree); `swatch` is the scale's 500 step, drawn in the picker.
// Violet, the Mosaic template's colour, is the default.

export const ACCENTS = [
  { id: 'violet', name: 'Violet', swatch: '#8470ff' },
  { id: 'green', name: 'Green', swatch: '#15803d' },
  { id: 'emerald', name: 'Emerald', swatch: '#047857' },
  { id: 'blue', name: 'Blue', swatch: '#2563eb' },
  { id: 'rose', name: 'Rose', swatch: '#e11d48' },
  { id: 'graphite', name: 'Graphite', swatch: '#475569' },
] as const

export type AccentId = (typeof ACCENTS)[number]['id']

export const DEFAULT_ACCENT: AccentId = 'violet'

export function isAccentId(value: unknown): value is AccentId {
  return ACCENTS.some((a) => a.id === value)
}
