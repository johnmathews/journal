// Types for async background jobs. Mirrors the server-side shape in
// server/src/journal/models.py (Job dataclass) and the
// /api/jobs/{id} REST response.
//
// Field names are snake_case on purpose to match the wire format. The
// rest of the webapp leans camelCase, but for this narrow layer —
// where the store holds a faithful copy of the server row and the
// modal UI reads `progress_current` / `progress_total` / `error_message`
// directly — mirroring the API contract is more important than local
// consistency. See journal/260411-batch-job-ui.md.

// Job, JobType, JobStatus and JobSubmissionResponse (the 202 body of every
// route that queues a job) are generated from the server's API contract
// (server/src/journal/api/contract/schemas.py). JobType lists every job
// type the server creates (a server test checks it against the code), plus
// legacy types that only old job rows carry.
import type { JobStatus } from './generated/api'

export type {
  Job,
  JobListResponse,
  JobStatus,
  JobSubmissionResponse,
  JobType,
} from './generated/api'

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
