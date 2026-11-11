import { apiFetch } from './client'

/**
 * Summary returned by `POST /api/admin/reload/ocr-context`.
 *
 * `provider` is one of "anthropic" or "gemini" (or "anthropic" when
 * `dual_pass=true` and Gemini is the secondary). `model` is the
 * configured model id, or "default" when the provider is using its
 * built-in default. `context_chars` and `context_files` describe the
 * `OCR_CONTEXT_DIR` glossary the freshly-built provider was primed
 * with.
 */
export interface OcrContextReloadSummary {
  reloaded: 'ocr-context'
  provider: string
  model: string
  dual_pass: boolean
  context_files: number
  context_chars: number
  reloaded_at: string
}

/**
 * Summary returned by `POST /api/admin/reload/transcription-context`.
 *
 * `stack` is the human-readable description of the freshly-built
 * provider chain — same format as the server's startup log line, e.g.
 * `"openai/whisper-1"` or
 * `"openai/whisper-1 → openai/gpt-4o-transcribe (shadow=gemini/...)"`.
 */
export interface TranscriptionContextReloadSummary {
  reloaded: 'transcription-context'
  stack: string
  context_files: number
  context_chars: number
  reloaded_at: string
}

/**
 * Summary returned by `POST /api/admin/reload/mood-dimensions`.
 *
 * `dimensions` is the list of dimension names freshly loaded from the
 * TOML, in file order.
 */
export interface MoodDimensionsReloadSummary {
  reloaded: 'mood-dimensions'
  dimension_count: number
  dimensions: string[]
  reloaded_at: string
}

/**
 * Trigger a reload of the OCR provider against the current
 * `OCR_CONTEXT_DIR` glossary. Admin-only — non-admin sessions get 403,
 * unauthenticated requests get 401.
 */
export function reloadOcrContext(): Promise<OcrContextReloadSummary> {
  return apiFetch<OcrContextReloadSummary>('/api/admin/reload/ocr-context', {
    method: 'POST',
  })
}

/**
 * Trigger a reload of the transcription provider stack. The OCR and
 * transcription reloads are intentionally separate even though they
 * read the same context directory — see docs/configuration.md.
 */
export function reloadTranscriptionContext(): Promise<TranscriptionContextReloadSummary> {
  return apiFetch<TranscriptionContextReloadSummary>(
    '/api/admin/reload/transcription-context',
    { method: 'POST' },
  )
}

/**
 * Trigger a reload of the mood-dimensions TOML and rebuild the
 * `MoodScoringService`. Returns 409 (translated to ApiRequestError) if
 * the server has `JOURNAL_ENABLE_MOOD_SCORING` unset.
 */
export function reloadMoodDimensions(): Promise<MoodDimensionsReloadSummary> {
  return apiFetch<MoodDimensionsReloadSummary>(
    '/api/admin/reload/mood-dimensions',
    { method: 'POST' },
  )
}
