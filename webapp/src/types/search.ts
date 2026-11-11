// Search types. The `/api/search` and `/api/search/answer` response shapes
// are generated from the server's API contract
// (server/src/journal/api/contract/schemas.py); request params stay
// hand-written below.
//
// - `SearchResultItem.snippet` is an FTS5 excerpt with ASCII `\x02` (start)
//   and `\x03` (end) around matched terms when BM25 contributed (see
//   `src/utils/searchSnippet.ts` for the renderer); `matching_chunks` is
//   filled when dense retrieval contributed. Either or both may be present.
// - `SearchChunkMatch` offsets and `chunk_index` are null for entries
//   ingested before chunk persistence shipped.
import type { DateFilterParams, PaginationParams } from './entry'
import type { SearchSort } from './generated/api'

export type {
  AnswerCitation,
  AnswerResponse,
  SearchChunkMatch,
  SearchResponse,
  SearchResultItem,
  SearchSort,
} from './generated/api'

export interface SearchRequestParams
  extends PaginationParams, DateFilterParams {
  q: string
  sort?: SearchSort
}

/** Request body for the opt-in answer-synthesis endpoint. */
export interface AnswerRequestParams extends DateFilterParams {
  q: string
}
