import type { EntryDetail } from './entry'

export interface IngestTextRequest {
  text: string
  entry_date?: string
  source_type?: 'text_entry' | 'imported_text_file' | 'imported_audio_file'
}

export interface IngestTextResponse {
  entry: EntryDetail
  mood_job_id: string | null
  entity_extraction_job_id: string | null
}

export interface IngestImagesResponse {
  job_id: string
  status: 'queued'
}

export interface IngestAudioResponse {
  job_id: string
  status: 'queued'
}
