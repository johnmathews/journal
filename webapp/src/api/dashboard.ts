import type {
  WritingStatsParams,
  WritingStatsResponse,
} from '@/types/dashboard'
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
 * Fetch per-bucket writing frequency + word count from the
 * journal-server dashboard endpoint. Throws `ApiRequestError`
 * on 4xx/5xx — the store surfaces the server-supplied message
 * directly to the user (notably `invalid_bin` / 400 for an
 * unsupported granularity, which should only happen if the
 * frontend UI drifts out of sync with the server contract).
 */
export function fetchWritingStats(
  params: WritingStatsParams = {},
): Promise<WritingStatsResponse> {
  const query = buildQuery({
    bin: params.bin,
    from: params.from,
    to: params.to,
  })
  return apiFetch<WritingStatsResponse>(`/api/dashboard/writing-stats${query}`)
}
