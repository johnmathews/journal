export interface EntrySummary {
  id: number
  entry_date: string
  source_type: 'ocr' | 'voice' | 'manual' | 'import'
  page_count: number
  word_count: number
  chunk_count: number
  created_at: string
}

/** A character range in `EntryDetail.raw_text` that the OCR model
 * flagged as uncertain at ingestion time. Offsets are half-open:
 * `raw_text.slice(char_start, char_end)` yields the uncertain span.
 *
 * Spans are always anchored to `raw_text`, never `final_text`. This
 * makes them immune to user edits — editing `final_text` never
 * invalidates a span, because `raw_text` is immutable. The webapp's
 * Review toggle overlays these spans on the Original OCR panel only.
 */
export interface UncertainSpan {
  char_start: number
  char_end: number
}

export interface EntryDetail {
  id: number
  entry_date: string
  source_type: 'ocr' | 'voice' | 'manual' | 'import'
  raw_text: string
  final_text: string
  page_count: number
  word_count: number
  chunk_count: number
  language: string
  created_at: string
  updated_at: string
  /** Character ranges in `raw_text` flagged as uncertain by the OCR
   * model. Always present in API responses; empty for entries
   * ingested before migration 0005 and for entries where the model
   * was fully confident. */
  uncertain_spans: UncertainSpan[]
}

export interface EntryListResponse {
  items: EntrySummary[]
  total: number
  limit: number
  offset: number
}

export interface Statistics {
  total_entries: number
  date_range_start: string | null
  date_range_end: string | null
  total_words: number
  avg_words_per_entry: number
  entries_per_month: number
}

export interface PaginationParams {
  limit?: number
  offset?: number
}

export interface DateFilterParams {
  start_date?: string
  end_date?: string
}

export interface EntryListParams extends PaginationParams, DateFilterParams {}

export interface ApiError {
  error: string
  message: string
}

/** A single chunk with its source character range and token count.
 *
 * `char_start` / `char_end` are character offsets into the entry's
 * `final_text` (or `raw_text` as fallback) — `char_end` is exclusive.
 * Slicing `final_text[char_start:char_end]` yields the source range
 * the chunk covers. `text` is the chunk's rendered content with
 * normalised paragraph/sentence separators and may differ slightly
 * from the source slice.
 */
export interface Chunk {
  index: number
  text: string
  char_start: number
  char_end: number
  token_count: number
}

export interface EntryChunksResponse {
  entry_id: number
  chunks: Chunk[]
}

/** One token as seen by the embedding model's tokenizer.
 *
 * `char_start` / `char_end` are character offsets into `final_text`
 * (valid UTF-8 round-trips exactly through tiktoken, so slicing
 * reconstructs the text). Leading whitespace is part of the token
 * (e.g. `" world"`), which matches how the model sees the text.
 */
export interface TokenSpan {
  index: number
  token_id: number
  text: string
  char_start: number
  char_end: number
}

export interface EntryTokensResponse {
  entry_id: number
  /** The tiktoken encoding name used to tokenise the entry. */
  encoding: string
  /** Hint at which model's tokenizer this matches (e.g. text-embedding-3-large). */
  model_hint: string
  token_count: number
  tokens: TokenSpan[]
}
