// Types for the entity-tracking feature. Response shapes the server
// returns from the entities/entries routes are generated from its API
// contract (server/src/journal/api/contract/schemas.py); request params,
// error bodies and the not-yet-covered merge/quarantine routes stay
// hand-written below.
import type { Entity, EntitySummary, EntityType } from './generated/api'

export type {
  AliasLookupResponse,
  Entity,
  EntityDeleteResponse,
  EntityListResponse,
  EntityMention,
  EntityMentionsResponse,
  EntityRelationship,
  EntityRelationshipsResponse,
  EntitySummary,
  EntityType,
  EntityUpdateResponse,
  EntryEntitiesResponse,
} from './generated/api'

export const ENTITY_TYPES: EntityType[] = [
  'person',
  'place',
  'activity',
  'organization',
  'topic',
  'other',
]

export interface QuarantinedEntitiesResponse {
  items: EntitySummary[]
  total: number
}

// --- List / detail / params ---

export interface EntityListParams {
  type?: EntityType
  search?: string
  limit?: number
  offset?: number
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

// --- Management (update / delete / merge) ---

export interface EntityUpdateRequest {
  canonical_name?: string
  entity_type?: EntityType
  description?: string
}

export interface EntityMergeRequest {
  survivor_id: number
  absorbed_ids: number[]
}

// --- Alias management ---
//
// POST /api/entities/{id}/aliases adds an alias. The 201 response is
// the updated Entity. A 409 response means the alias is already
// mapped to a different entity for this user; the body has the
// fields below so the webapp can offer the user a "merge into the
// existing entity" flow.
export interface AliasCollisionResponse {
  error: string
  alias: string
  existing_entity_id: number
  existing_canonical_name: string
  existing_entity_type: EntityType
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

// --- Pair decisions ("not a duplicate" — persisted across sessions) ---

export interface PairDecision {
  id: number
  entity_a: EntitySummary
  entity_b: EntitySummary
  decision: 'rejected'
  decided_at: string
}

export interface PairDecisionsResponse {
  items: PairDecision[]
  total: number
}

// Extraction is triggered asynchronously: POST /api/entities/extract
// returns a JobSubmissionResponse from src/types/job.ts, and the final
// per-entry results land under Job.result once the background job
// reaches a terminal status. There is no synchronous response shape
// to model here anymore.
