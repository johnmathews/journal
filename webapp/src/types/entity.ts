// Types for the entity-tracking feature. Response shapes the server
// returns from the entity, merge, candidate and quarantine routes are
// generated from its API contract
// (server/src/journal/api/contract/schemas.py); request params and the
// alias-collision error body stay hand-written below.
import type { EntitySummary, EntityType, ErrorResponse } from './generated/api'

export type {
  AliasLookupResponse,
  Entity,
  EntityDeleteResponse,
  EntityListResponse,
  EntityMention,
  EntityMentionsResponse,
  EntityMergeResponse,
  EntityRelationship,
  EntityRelationshipsResponse,
  EntitySummary,
  EntityType,
  EntityUpdateResponse,
  EntryEntitiesResponse,
  MergeCandidate,
  MergeCandidatesResponse,
  MergeCandidateStatus,
  MergeHistoryEntry,
  MergeHistoryResponse,
  PairDecision,
  PairDecisionDeleteResponse,
  PairDecisionsResponse,
  QuarantinedEntitiesResponse,
  ResolveMergeCandidateResponse,
} from './generated/api'

export const ENTITY_TYPES: EntityType[] = [
  'person',
  'place',
  'activity',
  'organization',
  'topic',
  'other',
]

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
export interface AliasCollisionResponse extends ErrorResponse {
  alias: string
  existing_entity_id: number
  existing_canonical_name: string
  existing_entity_type: EntityType
}

// Extraction is triggered asynchronously: POST /api/entities/extract
// returns a JobSubmissionResponse from src/types/job.ts, and the final
// per-entry results land under Job.result once the background job
// reaches a terminal status. There is no synchronous response shape
// to model here anymore.
