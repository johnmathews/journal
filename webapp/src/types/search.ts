import type { DateFilterParams, PaginationParams } from './entry'

export type SearchMode = 'semantic' | 'keyword'

/**
 * One chunk within a matching entry. Mirrors the server's
 * `ChunkMatch` dataclass. Offsets and `chunk_index` are nullable
 * because entries ingested before chunk persistence shipped have no
 * `entry_chunks` rows to join against and the server returns `null`
 * for those fields. Keyword-mode responses always have
 * `matching_chunks === []`, so the nullability only matters in
 * semantic mode.
 */
export interface SearchChunkMatch {
  text: string
  score: number
  chunk_index: number | null
  char_start: number | null
  char_end: number | null
}

/**
 * One entry in a search response. In `semantic` mode, `snippet` is
 * `null` and `matching_chunks` is sorted descending by score. In
 * `keyword` mode, `matching_chunks` is empty and `snippet` is a
 * short excerpt with ASCII `\x02` (start) and `\x03` (end) control
 * characters wrapping matched terms — see `src/utils/searchSnippet.ts`
 * for the renderer that turns these into HTML.
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
  mode?: SearchMode
}

export interface SearchResponse {
  query: string
  mode: SearchMode
  limit: number
  offset: number
  items: SearchResultItem[]
}
