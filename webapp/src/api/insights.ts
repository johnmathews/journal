import type {
  EntityDistributionParams,
  EntityDistributionResponse,
  MoodDrilldownParams,
  MoodDrilldownResponse,
} from '@/types/insights'
import { apiFetch } from './client'

// Re-export mood functions from dashboard — no duplication.
export { fetchMoodDimensions, fetchMoodTrends } from './dashboard'

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
 * Fetch per-entry mood scores for a given dimension and date window.
 * Powers the drill-down panel when the user clicks a mood chart point.
 */
export function fetchMoodDrilldown(
  params: MoodDrilldownParams,
): Promise<MoodDrilldownResponse> {
  const query = buildQuery({
    dimension: params.dimension,
    from: params.from,
    to: params.to,
  })
  return apiFetch<MoodDrilldownResponse>(
    `/api/dashboard/mood-drilldown${query}`,
  )
}

/**
 * Fetch entity mention counts grouped by entity, filtered by type
 * and date range. Powers the "what I talk about" doughnut chart.
 */
export function fetchEntityDistribution(
  params: EntityDistributionParams = {},
): Promise<EntityDistributionResponse> {
  const query = buildQuery({
    type: params.type,
    from: params.from,
    to: params.to,
    limit: params.limit,
  })
  return apiFetch<EntityDistributionResponse>(
    `/api/dashboard/entity-distribution${query}`,
  )
}
