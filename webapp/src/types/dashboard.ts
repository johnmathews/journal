/**
 * Dashboard types. The `/api/dashboard/*` response envelopes are generated
 * from the server's API contract
 * (server/src/journal/api/contract/schemas.py); request params, the range
 * picker and the tile layout stay hand-written below.
 */
import type { DashboardBin } from './generated/api'

export type {
  CalendarDay,
  CalendarHeatmapResponse,
  DashboardBin,
  EntityTrendBin,
  EntityTrendsResponse,
  MoodBin,
  MoodDimension,
  MoodDimensionsMeta,
  MoodDimensionsResponse,
  MoodEntityCorrelationItem,
  MoodEntityCorrelationResponse,
  MoodScaleType,
  MoodTrendBin,
  MoodTrendsResponse,
  WordCountBucket,
  WordCountDistributionResponse,
  WordCountStats,
  WritingFrequencyBin,
  WritingStatsResponse,
} from './generated/api'

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

export interface WritingStatsParams {
  bin?: DashboardBin
  from?: string | null
  to?: string | null
}

export interface MoodTrendsParams {
  bin?: DashboardBin
  from?: string | null
  to?: string | null
  dimension?: string | null
}

// --- Calendar Heatmap ---

export interface CalendarHeatmapParams {
  from?: string | null
  to?: string | null
}

// --- Entity Trends ---

export interface EntityTrendsParams {
  bin?: DashboardBin
  from?: string | null
  to?: string | null
  type?: string
  limit?: number
}

// --- Mood-Entity Correlation ---

export interface MoodEntityCorrelationParams {
  dimension?: string
  from?: string | null
  to?: string | null
  type?: string
  limit?: number
}

// --- Word Count Distribution ---

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
  /**
   * `data-testid` stamped onto the tile's `<section>` by `TileGrid`.
   * Some dashboard tests select tiles by these ids; preserving them
   * keeps the extraction faithful.
   */
  testId: string
}

export const DASHBOARD_TILES: readonly DashboardTileDef[] = [
  {
    id: 'calendar-heatmap',
    title: 'Writing Consistency',
    span: 1,
    testId: 'dashboard-calendar-section',
  },
  {
    id: 'entity-distribution',
    title: 'What I Write About',
    span: 1,
    testId: 'dashboard-entity-section',
  },
  {
    id: 'writing-frequency',
    title: 'Writing Frequency',
    span: 1,
    testId: 'dashboard-writing-chart-card',
  },
  {
    id: 'word-count',
    title: 'Word Count',
    span: 1,
    testId: 'dashboard-word-chart-card',
  },
  {
    id: 'mood-trends',
    title: 'Mood Trends',
    span: 2,
    requiresMoodScoring: true,
    testId: 'dashboard-mood-chart-card',
  },
  {
    id: 'topic-trends',
    title: 'Topic Trends',
    span: 2,
    testId: 'dashboard-entity-trends-section',
  },
  {
    id: 'mood-entity-correlation',
    title: 'Mood by Entity',
    span: 2,
    requiresMoodScoring: true,
    testId: 'dashboard-mood-correlation-section',
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
