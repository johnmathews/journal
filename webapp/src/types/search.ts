import type { DateFilterParams, PaginationParams } from './entry'

/**
 * One chunk within a matching entry. Mirrors the server's
 * `ChunkMatch` dataclass. Offsets and `chunk_index` are nullable
 * because entries ingested before chunk persistence shipped have no
 * `entry_chunks` rows to join against and the server returns `null`
 * for those fields.
 */
export interface SearchChunkMatch {
  text: string
  score: number
  chunk_index: number | null
  char_start: number | null
  char_end: number | null
}

/**
 * One entry in a hybrid search response.
 *
 * - `snippet` is populated when BM25 contributed to the match — it's
 *   a short FTS5 excerpt with ASCII `\x02` (start) and `\x03` (end)
 *   control characters wrapping matched terms (see
 *   `src/utils/searchSnippet.ts` for the renderer).
 * - `matching_chunks` is populated when dense (embedding) retrieval
 *   contributed, sorted by chunk similarity descending.
 *
 * Either or both may be present per item — a result that both
 * retrievers found will carry both signals.
 */
export interface SearchResultItem {
  entry_id: number
  entry_date: string
  text: string
  score: number
  snippet: string | null
  matching_chunks: SearchChunkMatch[]
}

export interface SearchRequestParams
  extends PaginationParams, DateFilterParams {
  q: string
}

export interface SearchResponse {
  query: string
  limit: number
  offset: number
  /**
   * Class name of the active L2 reranker on the server (e.g.
   * `AnthropicReranker`, `NoopReranker`). Useful for debugging and
   * cache busting.
   */
  reranker: string
  items: SearchResultItem[]
}
