// Types for the entity-tracking feature. Mirrors the server-side
// shapes in journal-server/src/journal/entitystore/store.py and
// journal-server/src/journal/models.py.

export type EntityType =
  | 'person'
  | 'place'
  | 'activity'
  | 'organization'
  | 'topic'
  | 'other'

export const ENTITY_TYPES: EntityType[] = [
  'person',
  'place',
  'activity',
  'organization',
  'topic',
  'other',
]

export interface Entity {
  id: number
  entity_type: EntityType
  canonical_name: string
  description: string
  aliases: string[]
  first_seen: string
  created_at: string
  updated_at: string
}

export interface EntitySummary {
  id: number
  entity_type: EntityType
  canonical_name: string
  aliases: string[]
  mention_count: number
  first_seen: string
}

export interface EntityMention {
  id: number
  entity_id: number
  entry_id: number
  entry_date: string
  quote: string
  confidence: number
  extraction_run_id: string
  created_at: string
}

export interface EntityRelationship {
  id: number
  subject_entity_id: number
  subject_name: string
  subject_type: EntityType
  predicate: string
  object_entity_id: number
  object_name: string
  object_type: EntityType
  quote: string
  entry_id: number
  entry_date: string
  confidence: number
}

// --- List / detail / params ---

export interface EntityListParams {
  type?: EntityType
  search?: string
  limit?: number
  offset?: number
}

export interface EntityListResponse {
  items: EntitySummary[]
  total: number
  limit: number
  offset: number
}

export interface EntityMentionsResponse {
  entity_id: number
  mentions: EntityMention[]
  total: number
}

export interface EntityRelationshipsResponse {
  entity_id: number
  outgoing: EntityRelationship[]
  incoming: EntityRelationship[]
}

// Entity chip shown on the entry detail view. The server's
// GET /api/entries/{id}/entities returns one of these per distinct
// entity mentioned in the entry.
export interface EntryEntityRef {
  entity_id: number
  canonical_name: string
  entity_type: EntityType
  mention_count: number
}

export interface EntryEntitiesResponse {
  entry_id: number
  entities: EntryEntityRef[]
}

// --- Extraction trigger ---

export interface ExtractionResult {
  entry_id: number
  extraction_run_id: string
  entities_created: number
  entities_matched: number
  mentions_created: number
  relationships_created: number
  warnings: string[]
}

export interface ExtractionTriggerResponse {
  results: ExtractionResult[]
}
