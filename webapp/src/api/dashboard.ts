import type {
  CalendarHeatmapParams,
  CalendarHeatmapResponse,
  EntityTrendsParams,
  EntityTrendsResponse,
  MoodDimensionsResponse,
  MoodEntityCorrelationParams,
  MoodEntityCorrelationResponse,
  MoodTrendsParams,
  MoodTrendsResponse,
  WordCountDistributionParams,
  WordCountDistributionResponse,
  WritingStatsParams,
  WritingStatsResponse,
} from '@/types/dashboard'
import { apiFetch } from './client'

function buildQuery(
  params: Record<string, string | number | undefined | null>,
): string {
  const entries = Object.entries(params).filter(
    ([, v]) => v !== undefined && v !== null && v !== '',
  )
  if (entries.length === 0) return ''
  return (
    '?' +
    new URLSearchParams(entries.map(([k, v]) => [k, String(v)])).toString()
  )
}

/**
 * Fetch per-bucket writing frequency + word count from the
 * journal-server dashboard endpoint. Throws `ApiRequestError`
 * on 4xx/5xx — the store surfaces the server-supplied message
 * directly to the user (notably `invalid_bin` / 400 for an
 * unsupported granularity, which should only happen if the
 * frontend UI drifts out of sync with the server contract).
 */
export function fetchWritingStats(
  params: WritingStatsParams = {},
): Promise<WritingStatsResponse> {
  const query = buildQuery({
    bin: params.bin,
    from: params.from,
    to: params.to,
  })
  return apiFetch<WritingStatsResponse>(`/api/dashboard/writing-stats${query}`)
}

/**
 * Fetch the currently-loaded mood dimensions from the server.
 * The server loads these from a TOML file at startup, so the
 * frontend always sees whatever the operator has configured.
 *
 * Returns an empty `dimensions` array when scoring is disabled
 * on the server (`JOURNAL_ENABLE_MOOD_SCORING=false`) or when
 * the config file is empty — callers should render the "mood
 * scoring not configured" state rather than treating that as
 * an error.
 */
export function fetchMoodDimensions(): Promise<MoodDimensionsResponse> {
  return apiFetch<MoodDimensionsResponse>('/api/dashboard/mood-dimensions')
}

/**
 * Fetch per-bucket mood trends. Empty buckets (zero scored
 * entries for a dimension) are omitted server-side, so the
 * resulting series may have gaps — Chart.js handles those
 * naturally as discontinuities.
 *
 * The optional `dimension` param narrows the response to a
 * single facet. Omitting it returns every configured
 * dimension for which there's at least one scored entry in
 * the window.
 */
export function fetchMoodTrends(
  params: MoodTrendsParams = {},
): Promise<MoodTrendsResponse> {
  const query = buildQuery({
    bin: params.bin,
    from: params.from,
    to: params.to,
    dimension: params.dimension,
  })
  return apiFetch<MoodTrendsResponse>(`/api/dashboard/mood-trends${query}`)
}

/**
 * Fetch a day-by-day calendar heatmap of writing activity.
 * Each day has an entry count and total word count.
 */
export function fetchCalendarHeatmap(
  params: CalendarHeatmapParams = {},
): Promise<CalendarHeatmapResponse> {
  const query = buildQuery({
    from: params.from,
    to: params.to,
  })
  return apiFetch<CalendarHeatmapResponse>(
    `/api/dashboard/calendar-heatmap${query}`,
  )
}

/**
 * Fetch entity mention counts over time, bucketed by the
 * dashboard bin width. Returns one line per entity.
 */
export function fetchEntityTrends(
  params: EntityTrendsParams = {},
): Promise<EntityTrendsResponse> {
  const query = buildQuery({
    bin: params.bin,
    from: params.from,
    to: params.to,
    type: params.type,
    limit: params.limit,
  })
  return apiFetch<EntityTrendsResponse>(`/api/dashboard/entity-trends${query}`)
}

/**
 * Fetch average mood score per entity, with an overall
 * average for comparison. Powers the horizontal bar chart.
 */
export function fetchMoodEntityCorrelation(
  params: MoodEntityCorrelationParams = {},
): Promise<MoodEntityCorrelationResponse> {
  const query = buildQuery({
    dimension: params.dimension,
    from: params.from,
    to: params.to,
    type: params.type,
    limit: params.limit,
  })
  return apiFetch<MoodEntityCorrelationResponse>(
    `/api/dashboard/mood-entity-correlation${query}`,
  )
}

/**
 * Fetch a histogram of entry word counts. Each bucket covers
 * `bucket_size` words and includes a count of entries in that
 * range plus summary statistics.
 */
export function fetchWordCountDistribution(
  params: WordCountDistributionParams = {},
): Promise<WordCountDistributionResponse> {
  const query = buildQuery({
    from: params.from,
    to: params.to,
    bucket_size: params.bucket_size,
  })
  return apiFetch<WordCountDistributionResponse>(
    `/api/dashboard/word-count-distribution${query}`,
  )
}
