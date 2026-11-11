/**
 * Insights page types. Used by the mood drill-down and entity
 * distribution features on `/insights`. The response shapes are generated
 * from the server's API contract
 * (server/src/journal/api/contract/schemas.py); request params and the
 * entity-type picker stay hand-written below.
 */
import type { EntityType } from './generated/api'

export type {
  EntityDistributionItem,
  EntityDistributionResponse,
  MoodDrilldownEntry,
  MoodDrilldownResponse,
} from './generated/api'

/** Entity types the distribution chart can filter by (all of them). */
export type InsightsEntityType = EntityType

/** Picker order for the entity-type filter. */
export const INSIGHTS_ENTITY_TYPES: readonly InsightsEntityType[] = [
  'topic',
  'activity',
  'place',
  'person',
  'organization',
  'other',
] as const

export interface MoodDrilldownParams {
  dimension: string
  from: string
  to: string
}

export interface EntityDistributionParams {
  type?: InsightsEntityType
  from?: string | null
  to?: string | null
  limit?: number
}
