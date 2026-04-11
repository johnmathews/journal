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

/**
 * One mood-scoring facet as returned by
 * `GET /api/dashboard/mood-dimensions`. Mirrors the server's
 * `MoodDimension` dataclass byte-for-byte.
 *
 * `scale_type` determines how the frontend plots the facet:
 *
 * - `bipolar` — scores range `[-1, +1]`. 0 is a meaningful
 *   neutral centre.
 * - `unipolar` — scores range `[0, +1]`. 0 means absence of the
 *   positive pole, not neutral. A unipolar line never dips
 *   below 0.
 *
 * `score_min` / `score_max` are derived from `scale_type` on the
 * server and sent explicitly so the frontend doesn't have to
 * replicate the logic.
 */
export interface MoodDimension {
  name: string
  positive_pole: string
  negative_pole: string
  scale_type: 'bipolar' | 'unipolar'
  score_min: number
  score_max: number
  notes: string
}

export interface MoodDimensionsResponse {
  dimensions: MoodDimension[]
}

/**
 * One (period, dimension) bucket in the mood-trends response.
 * `avg_score` is the mean score across every entry in the
 * bucket that had a value for this dimension. Empty buckets
 * (zero scored entries for a dimension) are omitted server-side.
 */
export interface MoodTrendBin {
  period: string
  dimension: string
  avg_score: number
  entry_count: number
}

export interface MoodTrendsResponse {
  from: string | null
  to: string | null
  bin: DashboardBin
  bins: MoodTrendBin[]
}

export interface MoodTrendsParams {
  bin?: DashboardBin
  from?: string | null
  to?: string | null
  dimension?: string | null
}
