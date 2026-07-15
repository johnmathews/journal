/**
 * Display-only mood-dimension transforms for the dashboard.
 *
 * The server's `frustration` dimension is unipolar 0..1 with "higher = more
 * frustrated" (i.e. higher = worse) — every other dimension reads "higher =
 * better" in the chart. To keep the chart visually consistent without
 * weakening the LLM scoring signal (detecting an active negative affect is
 * easier than detecting baseline calm), the data model and prompt are left
 * alone and the dashboard renders frustration as `calm` with score `1 - x`.
 *
 * Storage, the API contract, and the LLM tool schema all still see
 * `frustration` with its original 0..1 score.
 */

import type { MoodDimension } from '@/types/dashboard'

/**
 * Map of `dimension.name` → display label for dimensions that should be
 * rendered with their score and label inverted in the dashboard. Add new
 * entries here only when the underlying dimension's "high score" semantics
 * read as bad in the chart.
 */
export const DISPLAY_INVERTED_DIMENSIONS: Readonly<Record<string, string>> = {
  frustration: 'calm',
  // Unipolar fatigue facets read "higher = more depleted" (worse). Invert so
  // the chart's "up = good" convention holds: high displayed value = fresh.
  // energy_vigor and tension_calm already read high = good, so they are NOT
  // inverted.
  physical_fatigue: 'physically fresh',
  mental_fatigue: 'mentally fresh',
}

export function isDisplayInverted(name: string): boolean {
  return name in DISPLAY_INVERTED_DIMENSIONS
}

/**
 * Label to render in the chart legend, dimension picker, drill-down header,
 * and anywhere else `positive_pole` would normally appear in the UI.
 */
export function displayLabel(
  d: Pick<MoodDimension, 'name' | 'positive_pole'>,
): string {
  return DISPLAY_INVERTED_DIMENSIONS[d.name] ?? d.positive_pole
}

/**
 * Dual-pole label for a dimension, used where a single pole would be
 * misleading. Bipolar dimensions span two opposed feelings, so a lone
 * positive-pole label (e.g. "energy") hides that the same line also
 * measures its opposite (fatigue). Returns `"<good> ↔ <bad>"` with the
 * displayed-good pole first: for a display-inverted bipolar dimension the
 * poles are swapped so the pole that reads high in the chart still leads.
 *
 * Unipolar dimensions genuinely have one pole (0 = absence, not the
 * opposite feeling), so a single `displayLabel` is honest — no arrow.
 */
export function displayPolarLabel(
  d: Pick<
    MoodDimension,
    'name' | 'positive_pole' | 'negative_pole' | 'scale_type'
  >,
): string {
  if (d.scale_type !== 'bipolar') {
    return displayLabel(d)
  }
  const inverted = isDisplayInverted(d.name)
  const good = inverted ? d.negative_pole : d.positive_pole
  const bad = inverted ? d.positive_pole : d.negative_pole
  return `${good} ↔ ${bad}`
}

/**
 * Transform a stored score into the value to plot. For inverted dimensions,
 * returns `score_max - score` so a high stored value (lots of the bad signal)
 * shows as a low displayed value, and vice versa. Non-inverted dimensions
 * pass through unchanged. `null` passes through.
 *
 * Inversion uses `score_max` (1.0 for the unipolar dimensions we currently
 * invert) rather than a hard-coded 1 so the helper stays correct if a
 * bipolar inverted dimension is ever added.
 */
export function displayScore(
  d: Pick<MoodDimension, 'name' | 'score_max'>,
  score: number | null,
): number | null {
  if (score === null) return null
  if (!isDisplayInverted(d.name)) return score
  return d.score_max - score
}
