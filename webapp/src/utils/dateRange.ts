/**
 * Quick-pick date ranges for the Search view.
 *
 * The dashboard already has its own `rangeToDates()` helper in
 * `stores/dashboard.ts`, but the search dropdown carries an extra
 * "custom" option (lets the user keep their own date pickers in
 * play) and doesn't share the dashboard's cache plumbing. Keeping
 * the helper local to search keeps both call sites simple.
 */

export type SearchRangePreset =
  | 'all'
  | 'last_1_month'
  | 'last_3_months'
  | 'last_6_months'
  | 'last_1_year'
  | 'custom'

export interface SearchRangeOption {
  value: SearchRangePreset
  label: string
}

/** Order is the order shown in the dropdown. */
export const SEARCH_RANGE_OPTIONS: readonly SearchRangeOption[] = [
  { value: 'all', label: 'All time' },
  { value: 'last_1_month', label: 'Last month' },
  { value: 'last_3_months', label: 'Last 3 months' },
  { value: 'last_6_months', label: 'Last 6 months' },
  { value: 'last_1_year', label: 'Last year' },
  { value: 'custom', label: 'Custom' },
] as const

/** ISO `YYYY-MM-DD` for a Date in the local timezone. */
function isoDate(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/**
 * Resolve a preset to concrete `from` / `to` ISO date strings.
 *
 * - `all`: both null (the API treats missing dates as "no bound").
 * - `custom`: both null — the caller is responsible for whatever
 *   the user typed into the date inputs.
 * - The relative presets anchor `to` at today and walk `from` back.
 */
export function presetToDates(
  preset: SearchRangePreset,
  now: Date = new Date(),
): { from: string | null; to: string | null } {
  if (preset === 'all' || preset === 'custom') {
    return { from: null, to: null }
  }
  const to = isoDate(now)
  const from = new Date(now)
  switch (preset) {
    case 'last_1_month':
      from.setMonth(from.getMonth() - 1)
      break
    case 'last_3_months':
      from.setMonth(from.getMonth() - 3)
      break
    case 'last_6_months':
      from.setMonth(from.getMonth() - 6)
      break
    case 'last_1_year':
      from.setFullYear(from.getFullYear() - 1)
      break
  }
  return { from: isoDate(from), to }
}
