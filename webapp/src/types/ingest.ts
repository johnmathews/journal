import type { EntryDetail } from './entry'

export interface IngestTextRequest {
  text: string
  entry_date?: string
  source_type?: 'manual' | 'import'
}

export interface IngestTextResponse {
  entry: EntryDetail
  mood_job_id: string | null
}

export interface IngestImagesResponse {
  job_id: string
  status: 'queued'
}
