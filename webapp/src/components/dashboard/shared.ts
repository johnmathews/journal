/**
 * Shared constants and helpers for the dashboard tile components.
 *
 * Extracted from `DashboardView.vue` (W23) so the per-tile chart
 * components stay consistent: the mood-trends and topic-trends charts
 * share one line palette, the doughnut keeps its own wider palette,
 * and the three tiles with entity-type tab strips render identical
 * labels.
 */

import type {
  DashboardBin,
  DashboardRange,
  WritingFrequencyBin,
} from '@/types/dashboard'
import type { InsightsEntityType } from '@/types/insights'
import { fillBins } from '@/utils/bins'
import { rangeToDates } from '@/stores/dashboard'

// One distinct hue per mood dimension. The mood config now emits ten
// dimensions (joy_sadness, energy_vigor, physical_fatigue, mental_fatigue,
// agency, fulfillment, connection, frustration, tension_calm,
// proactive_reactive), so this palette must hold at least ten colors that
// stay distinguishable in both light and dark themes. The trailing four are
// reused from DOUGHNUT_COLORS (already vetted for both themes).
export const MOOD_LINE_COLORS: readonly string[] = [
  '#8b5cf6', // violet
  '#0ea5e9', // sky
  '#22c55e', // green
  '#f59e0b', // amber
  '#ef4444', // red
  '#ec4899', // pink
  '#14b8a6', // teal
  '#a855f7', // purple
  '#6366f1', // indigo
  '#84cc16', // lime
  '#f97316', // orange
  '#06b6d4', // cyan
]

export const DOUGHNUT_COLORS: readonly string[] = [
  '#8b5cf6',
  '#0ea5e9',
  '#22c55e',
  '#f59e0b',
  '#ef4444',
  '#ec4899',
  '#14b8a6',
  '#a855f7',
  '#6366f1',
  '#84cc16',
  '#f97316',
  '#06b6d4',
]

export function entityTypeLabel(t: InsightsEntityType): string {
  const labels: Record<InsightsEntityType, string> = {
    topic: 'Topics',
    activity: 'Activities',
    place: 'Places',
    person: 'People',
    organization: 'Organizations',
    other: 'Other',
  }
  return labels[t]
}

/**
 * Zero-fill a sparse writing-frequency series over the selected range.
 *
 * The server's GROUP BY omits empty bins, which would render a
 * two-month writing gap as adjacent x-axis points. Zero-fill to a
 * contiguous grid over the selected range so gaps occupy real axis
 * space (range 'all' anchors at the earliest bin; `to` defaults to
 * today inside `fillBins`). See `utils/bins.ts` for the edge rules.
 */
export function filledWritingBins(
  bins: readonly WritingFrequencyBin[],
  range: DashboardRange,
  bin: DashboardBin,
): WritingFrequencyBin[] {
  const { from, to } = rangeToDates(range)
  return fillBins(bins, from, to, bin)
}
