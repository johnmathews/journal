import type { SearchRequestParams, SearchResponse } from '@/types/search'
import { apiFetch } from './client'

function buildQuery(
  params: Record<string, string | number | undefined | null>,
): string {
  const entries = Object.entries(params).filter(
    ([, v]) => v !== undefined && v !== null && v !== '',
  )
  if (entries.length === 0) return ''
  return (
    '?' +
    new URLSearchParams(entries.map(([k, v]) => [k, String(v)])).toString()
  )
}

/**
 * Call the journal-server `/api/search` endpoint. `q` is required
 * and non-empty; everything else is optional. Returns the server's
 * full envelope (query, mode, limit, offset, items) so callers can
 * detect "is there more" from `items.length === limit`.
 *
 * Throws `ApiRequestError` on 4xx/5xx. Notably, a malformed FTS5
 * query (unterminated quote, bare operator, etc.) produces a
 * 400 `invalid_query` which callers can surface directly as a
 * user-visible error.
 */
export function searchEntries(
  params: SearchRequestParams,
): Promise<SearchResponse> {
  const query = buildQuery({ ...params })
  return apiFetch<SearchResponse>(`/api/search${query}`)
}
