import type {
  EntryDetail,
  EntryListParams,
  EntryListResponse,
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
