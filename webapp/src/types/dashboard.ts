/**
 * Dashboard types. Mirror the server's `/api/dashboard/*`
 * response envelopes exactly — no client-side transformations
 * before the store layer.
 */

export type DashboardBin = 'week' | 'month' | 'quarter' | 'year'

export const DASHBOARD_BINS: readonly DashboardBin[] = [
  'week',
  'month',
  'quarter',
  'year',
] as const

/**
 * Fixed-length date-range options the picker offers. Arbitrary
 * custom ranges are not part of 3a — adding them later means
 * extending this union and the matching switch in the store.
 */
export type DashboardRange =
  | 'last_1_month'
  | 'last_3_months'
  | 'last_6_months'
  | 'last_1_year'
  | 'all'

export const DASHBOARD_RANGES: readonly DashboardRange[] = [
  'last_1_month',
  'last_3_months',
  'last_6_months',
  'last_1_year',
  'all',
] as const

export interface WritingFrequencyBin {
  /** ISO-8601 date of the bucket start — Monday for weeks, the
   *  1st of the month for months, etc. Plot on the x-axis. */
  bin_start: string
  entry_count: number
  total_words: number
}

export interface WritingStatsResponse {
  from: string | null
  to: string | null
  bin: DashboardBin
  bins: WritingFrequencyBin[]
}

export interface WritingStatsParams {
  bin?: DashboardBin
  from?: string | null
  to?: string | null
}
