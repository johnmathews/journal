import type {
  EntryChunksResponse,
  EntryDetail,
  EntryListParams,
  EntryListResponse,
  EntryTokensResponse,
  Statistics,
} from '@/types/entry'
import { apiFetch } from './client'

function buildQuery(
  params: Record<string, string | number | undefined | null>,
): string {
  const entries = Object.entries(params).filter(
    ([, v]) => v !== undefined && v !== null,
  )
  if (entries.length === 0) return ''
  return (
    '?' +
    new URLSearchParams(entries.map(([k, v]) => [k, String(v)])).toString()
  )
}

export function fetchEntries(
  params: EntryListParams = {},
): Promise<EntryListResponse> {
  const query = buildQuery({ ...params })
  return apiFetch<EntryListResponse>(`/api/entries${query}`)
}

export function fetchEntry(id: number): Promise<EntryDetail> {
  return apiFetch<EntryDetail>(`/api/entries/${id}`)
}

export function updateEntryText(
  id: number,
  finalText: string,
): Promise<EntryDetail> {
  return apiFetch<EntryDetail>(`/api/entries/${id}`, {
    method: 'PATCH',
    body: JSON.stringify({ final_text: finalText }),
  })
}

export function deleteEntry(
  id: number,
): Promise<{ deleted: boolean; id: number }> {
  return apiFetch<{ deleted: boolean; id: number }>(`/api/entries/${id}`, {
    method: 'DELETE',
  })
}

export function fetchStats(
  params: { start_date?: string; end_date?: string } = {},
): Promise<Statistics> {
  const query = buildQuery({ ...params })
  return apiFetch<Statistics>(`/api/stats${query}`)
}

/** Fetch persisted chunks (with source character offsets) for an entry.
 *
 * Used by the entry-detail overlay to draw chunk boundaries on top of
 * the text. The server returns a 404 with `error: "chunks_not_backfilled"`
 * for entries ingested before chunk persistence landed — callers should
 * inspect `ApiRequestError.errorCode` to surface the dedicated message.
 */
export function fetchEntryChunks(id: number): Promise<EntryChunksResponse> {
  return apiFetch<EntryChunksResponse>(`/api/entries/${id}/chunks`)
}

/** Fetch the tiktoken `cl100k_base` tokenisation of an entry's text.
 *
 * Computed on demand server-side from `final_text` (or `raw_text` as
 * fallback). Every token carries its char range in the source text so
 * the overlay can slice the original text for rendering.
 */
export function fetchEntryTokens(id: number): Promise<EntryTokensResponse> {
  return apiFetch<EntryTokensResponse>(`/api/entries/${id}/tokens`)
}
