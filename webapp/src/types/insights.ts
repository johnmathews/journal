/**
 * Insights page types. Used by the mood drill-down and entity
 * distribution features on `/insights`.
 */

export type InsightsEntityType = 'topic' | 'activity' | 'place'

export const INSIGHTS_ENTITY_TYPES: readonly InsightsEntityType[] = [
  'topic',
  'activity',
  'place',
] as const

/** One entry's mood score for a given dimension/period drill-down. */
export interface MoodDrilldownEntry {
  entry_id: number
  entry_date: string
  score: number
  confidence: number | null
  rationale: string | null
}

export interface MoodDrilldownResponse {
  dimension: string
  from: string
  to: string
  entries: MoodDrilldownEntry[]
}

export interface MoodDrilldownParams {
  dimension: string
  from: string
  to: string
}

/** One entity in the distribution chart. */
export interface EntityDistributionItem {
  canonical_name: string
  entity_type: string
  mention_count: number
}

export interface EntityDistributionResponse {
  type: string | null
  from: string | null
  to: string | null
  total: number
  items: EntityDistributionItem[]
}

export interface EntityDistributionParams {
  type?: InsightsEntityType
  from?: string | null
  to?: string | null
  limit?: number
}
