import { apiFetch } from './client'
import type { Job, JobSubmissionResponse } from '@/types/job'

// Parameters for POST /api/mood/backfill. `stale-only` only recomputes
// entries whose mood row is missing or out of date relative to the text;
// `force` recomputes every entry in range regardless.
export interface MoodBackfillParams {
  mode: 'stale-only' | 'force'
  start_date?: string
  end_date?: string
}

/**
 * Kick off the mood-backfill background job. Returns immediately with
 * the job id; the caller should poll `getJob` to track progress.
 */
export function triggerMoodBackfill(
  params: MoodBackfillParams,
): Promise<JobSubmissionResponse> {
  return apiFetch<JobSubmissionResponse>('/api/mood/backfill', {
    method: 'POST',
    body: JSON.stringify(params),
  })
}

/**
 * Fetch the current state of a background job by id. Throws
 * ApiRequestError with status 404 if the job is unknown.
 */
export function getJob(jobId: string): Promise<Job> {
  return apiFetch<Job>(`/api/jobs/${encodeURIComponent(jobId)}`)
}
