/**
 * CSS + color utilities ported from Mosaic's src/utils/Utils.js.
 * Only the functions load-bearing for chartjs-config.ts are retained.
 */

export function getCssVariable(variable: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(variable).trim()
}

function adjustHexOpacity(hexColor: string, opacity: number): string {
  const hex = hexColor.replace('#', '')
  const r = parseInt(hex.substring(0, 2), 16)
  const g = parseInt(hex.substring(2, 4), 16)
  const b = parseInt(hex.substring(4, 6), 16)
  return `rgba(${r}, ${g}, ${b}, ${opacity})`
}

function adjustHslOpacity(hslColor: string, opacity: number): string {
  return hslColor.replace('hsl(', 'hsla(').replace(')', `, ${opacity})`)
}

function adjustOklchOpacity(oklchColor: string, opacity: number): string {
  return oklchColor.replace(/oklch\((.*?)\)/, (_match, inner: string) => `oklch(${inner} / ${opacity})`)
}

export function adjustColorOpacity(color: string, opacity: number): string {
  if (color.startsWith('#')) return adjustHexOpacity(color, opacity)
  if (color.startsWith('hsl')) return adjustHslOpacity(color, opacity)
  if (color.startsWith('oklch')) return adjustOklchOpacity(color, opacity)
  throw new Error(`Unsupported color format: ${color}`)
}
