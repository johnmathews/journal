// Types for async background jobs. Mirrors the server-side shape in
// journal-server/src/journal/models.py (Job dataclass) and the
// /api/jobs/{id} REST response.
//
// Field names are snake_case on purpose to match the wire format. The
// rest of the webapp leans camelCase, but for this narrow layer —
// where the store holds a faithful copy of the server row and the
// modal UI reads `progress_current` / `progress_total` / `error_message`
// directly — mirroring the API contract is more important than local
// consistency. See journal/260411-batch-job-ui.md.

export type JobStatus = 'queued' | 'running' | 'succeeded' | 'failed'

export type JobType =
  | 'entity_extraction'
  | 'mood_backfill'
  | 'ingest_images'
  | 'ingest_audio'
  | 'mood_score_entry'
  | 'reprocess_embeddings'

/**
 * Response from the job-submission endpoints (POST /api/entities/extract,
 * POST /api/mood/backfill). Both return 202 Accepted with just enough to
 * start polling.
 */
export interface JobSubmissionResponse {
  job_id: string
  status: JobStatus
}

/**
 * Full job row returned by GET /api/jobs/{id}.
 */
export interface Job {
  id: string
  type: JobType
  status: JobStatus
  params: Record<string, unknown>
  progress_current: number
  progress_total: number
  result: Record<string, unknown> | null
  error_message: string | null
  status_detail: string | null
  created_at: string
  started_at: string | null
  finished_at: string | null
}

/**
 * Statuses that indicate the job will not change again. Polling loops
 * should stop the moment `isTerminal(status)` is true.
 */
export const TERMINAL_JOB_STATUSES: ReadonlySet<JobStatus> = new Set([
  'succeeded',
  'failed',
])

export function isTerminal(status: JobStatus): boolean {
  return TERMINAL_JOB_STATUSES.has(status)
}
