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

/**
 * Metadata about the mood-dimensions config file as a whole. Surfaced
 * on the admin "Moods" page so operators can see which definitions are
 * live without SSH'ing into the server. Empty strings when scoring is
 * disabled or the toml has no `[meta]` block — callers should treat
 * empty `version` as "unknown" rather than as an error.
 */
export interface MoodDimensionsMeta {
  version: string
  description: string
}

export interface MoodDimensionsResponse {
  dimensions: MoodDimension[]
  /**
   * Present on every response from a current server, but typed as
   * optional so historical fixtures and tests written before this
   * field existed don't all need updating. Callers should treat
   * missing `meta` as `{ version: '', description: '' }`.
   */
  meta?: MoodDimensionsMeta
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
  score_min: number | null
  score_max: number | null
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

// --- Calendar Heatmap ---

export interface CalendarDay {
  date: string
  entry_count: number
  total_words: number
}

export interface CalendarHeatmapResponse {
  from: string
  to: string
  days: CalendarDay[]
}

export interface CalendarHeatmapParams {
  from?: string | null
  to?: string | null
}

// --- Entity Trends ---

export interface EntityTrendBin {
  period: string
  entity: string
  mention_count: number
}

export interface EntityTrendsResponse {
  from: string | null
  to: string | null
  bin: DashboardBin
  entity_type: string
  entities: string[]
  bins: EntityTrendBin[]
}

export interface EntityTrendsParams {
  bin?: DashboardBin
  from?: string | null
  to?: string | null
  type?: string
  limit?: number
}

// --- Mood-Entity Correlation ---

export interface MoodEntityCorrelationItem {
  entity: string
  entity_type: string
  avg_score: number
  entry_count: number
}

export interface MoodEntityCorrelationResponse {
  dimension: string
  from: string | null
  to: string | null
  entity_type: string
  overall_avg: number
  items: MoodEntityCorrelationItem[]
}

export interface MoodEntityCorrelationParams {
  dimension?: string
  from?: string | null
  to?: string | null
  type?: string
  limit?: number
}

// --- Word Count Distribution ---

export interface WordCountBucket {
  range_start: number
  range_end: number
  count: number
}

export interface WordCountStats {
  min: number
  max: number
  avg: number
  median: number
  total_entries: number
}

export interface WordCountDistributionResponse {
  from: string | null
  to: string | null
  bucket_size: number
  buckets: WordCountBucket[]
  stats: WordCountStats
}

export interface WordCountDistributionParams {
  from?: string | null
  to?: string | null
  bucket_size?: number
}

// --- Dashboard tile layout ---

export type DashboardTileId =
  | 'calendar-heatmap'
  | 'entity-distribution'
  | 'writing-frequency'
  | 'word-count'
  | 'mood-trends'
  | 'topic-trends'
  | 'mood-entity-correlation'

export interface DashboardTileDef {
  id: DashboardTileId
  title: string
  /** Number of grid columns to span: 1 = half-width, 2 = full-width */
  span: 1 | 2
  /** If set, tile is only shown when this condition is true */
  requiresMoodScoring?: boolean
}

export const DASHBOARD_TILES: readonly DashboardTileDef[] = [
  { id: 'calendar-heatmap', title: 'Writing Consistency', span: 1 },
  { id: 'entity-distribution', title: 'What I Write About', span: 1 },
  { id: 'writing-frequency', title: 'Writing Frequency', span: 1 },
  { id: 'word-count', title: 'Word Count', span: 1 },
  {
    id: 'mood-trends',
    title: 'Mood Trends',
    span: 2,
    requiresMoodScoring: true,
  },
  { id: 'topic-trends', title: 'Topic Trends', span: 2 },
  {
    id: 'mood-entity-correlation',
    title: 'Mood by Entity',
    span: 2,
    requiresMoodScoring: true,
  },
] as const

export const DEFAULT_TILE_ORDER: readonly DashboardTileId[] =
  DASHBOARD_TILES.map((t) => t.id)

export type TileSpan = 1 | 2

export interface DashboardLayout {
  tileOrder: DashboardTileId[]
  hiddenTiles: DashboardTileId[]
  tileWidths?: Partial<Record<DashboardTileId, TileSpan>>
}
