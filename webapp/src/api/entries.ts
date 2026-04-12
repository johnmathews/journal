import type {
  EntryChunksResponse,
  EntryDetail,
  EntryListParams,
  EntryListResponse,
  EntryTokensResponse,
  Statistics,
} from '@/types/entry'
import type {
  IngestTextRequest,
  IngestTextResponse,
  IngestImagesResponse,
} from '@/types/ingest'
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

export function updateEntryDate(
  id: number,
  entryDate: string,
): Promise<EntryDetail> {
  return apiFetch<EntryDetail>(`/api/entries/${id}`, {
    method: 'PATCH',
    body: JSON.stringify({ entry_date: entryDate }),
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

export async function ingestText(
  request: IngestTextRequest,
): Promise<IngestTextResponse> {
  return apiFetch<IngestTextResponse>('/api/entries/ingest/text', {
    method: 'POST',
    body: JSON.stringify(request),
  })
}

export async function ingestFile(
  file: File,
  entryDate?: string,
): Promise<IngestTextResponse> {
  const formData = new FormData()
  formData.append('file', file)
  if (entryDate) {
    formData.append('entry_date', entryDate)
  }
  return apiFetch<IngestTextResponse>('/api/entries/ingest/file', {
    method: 'POST',
    body: formData,
    headers: {},
  })
}

export async function ingestImages(
  files: File[],
  entryDate?: string,
): Promise<IngestImagesResponse> {
  const formData = new FormData()
  for (const file of files) {
    formData.append('images', file)
  }
  if (entryDate) {
    formData.append('entry_date', entryDate)
  }
  return apiFetch<IngestImagesResponse>('/api/entries/ingest/images', {
    method: 'POST',
    body: formData,
    headers: {},
  })
}
