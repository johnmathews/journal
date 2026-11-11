// Entry response types are generated from the server's API contract
// (contract/api.schema.json -> src/types/generated/api.ts). Edit the
// TypedDicts in server/src/journal/api/contract/schemas.py, not these.
// Request params and other client-side types stay hand-written below.
export type {
  ContentBoundary,
  EntryChunk as Chunk,
  EntryChunksResponse,
  EntryDeleteResponse,
  EntryDetail,
  EntryListResponse,
  EntrySummary,
  EntryTokensResponse,
  EntryUpdateResponse,
  SourceType,
  Statistics,
  TokenSpan,
  UncertainSpan,
} from './generated/api'

export interface PaginationParams {
  limit?: number
  offset?: number
}

export interface DateFilterParams {
  start_date?: string
  end_date?: string
}

export interface EntryListParams extends PaginationParams, DateFilterParams {}
