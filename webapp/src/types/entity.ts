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
  // Quarantine state. The detail endpoint always emits these
  // fields; older clients can ignore them safely. When the
  // entity is not quarantined, `is_quarantined` is false and
  // both string fields are empty.
  is_quarantined?: boolean
  quarantine_reason?: string
  quarantined_at?: string
}

export interface EntitySummary {
  id: number
  entity_type: EntityType
  canonical_name: string
  aliases: string[]
  mention_count: number
  first_seen: string
  last_seen: string
  quotes?: string[]
  // Quarantine state mirrors the server's entity-summary shape.
  // Active-list responses always set `is_quarantined` to false;
  // the dedicated quarantined-list endpoint sets it to true.
  is_quarantined?: boolean
  quarantine_reason?: string
  quarantined_at?: string
}

export interface QuarantinedEntitiesResponse {
  items: EntitySummary[]
  total: number
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

// Entity chip shown on the entry detail view.
//
// Note on the response shape: the server's
// GET /api/entries/{id}/entities returns a full EntitySummary per
// row, under the key `items` (matching every other list endpoint
// in this API — `/api/entries`, `/api/entities`, search, etc.).
// For a while the webapp expected a bespoke EntryEntityRef shape
// with `entity_id` under a key `entities`; both halves of that
// were wrong, and at runtime `resp.entities` silently became
// `undefined` and crashed the EntryDetailView template on
// `entryEntities.length`. The type below mirrors the real server
// contract. See journal/260411-entry-entities-contract.md.
export type EntryEntityRef = EntitySummary

export interface EntryEntitiesResponse {
  entry_id: number
  items: EntitySummary[]
  total: number
}

// --- Management (update / delete / merge) ---

export interface EntityUpdateRequest {
  canonical_name?: string
  entity_type?: EntityType
  description?: string
}

export interface EntityDeleteResponse {
  deleted: boolean
  id: number
}

export interface EntityMergeRequest {
  survivor_id: number
  absorbed_ids: number[]
}

export interface EntityMergeResponse {
  survivor: Entity
  absorbed_ids: number[]
  mentions_reassigned: number
  relationships_reassigned: number
  aliases_added: number
}

// --- Merge candidates ---

export interface MergeCandidate {
  id: number
  entity_a: EntitySummary
  entity_b: EntitySummary
  similarity: number
  status: 'pending' | 'accepted' | 'dismissed'
  extraction_run_id: string
  created_at: string
}

export interface MergeCandidatesResponse {
  items: MergeCandidate[]
  total: number
}

export interface MergeHistoryEntry {
  id: number
  survivor_id: number
  absorbed_id: number
  absorbed_name: string
  absorbed_type: EntityType
  absorbed_desc: string
  absorbed_aliases: string[]
  merged_at: string
  merged_by: string
}

export interface MergeHistoryResponse {
  entity_id: number
  history: MergeHistoryEntry[]
}

// Extraction is triggered asynchronously: POST /api/entities/extract
// returns a JobSubmissionResponse from src/types/job.ts, and the final
// per-entry results land under Job.result once the background job
// reaches a terminal status. There is no synchronous response shape
// to model here anymore.
