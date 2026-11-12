// Ingestion response types are generated from the server's API contract
// (server/src/journal/api/contract/schemas.py). Image and audio ingestion
// queue a background job and answer 202 with the shared job-submission body.
// The text-ingestion request body stays hand-written below.
export type {
  IngestTextResponse,
  JobSubmissionResponse as IngestAudioResponse,
  JobSubmissionResponse as IngestImagesResponse,
} from './generated/api'

export interface IngestTextRequest {
  text: string
  entry_date?: string
  source_type?: 'text_entry' | 'imported_text_file' | 'imported_audio_file'
}
