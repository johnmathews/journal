export interface EntrySummary {
  id: number
  entry_date: string
  source_type: 'ocr' | 'voice'
  page_count: number
  word_count: number
  chunk_count: number
  created_at: string
}

export interface EntryDetail {
  id: number
  entry_date: string
  source_type: 'ocr' | 'voice'
  raw_text: string
  final_text: string
  page_count: number
  word_count: number
  chunk_count: number
  language: string
  created_at: string
  updated_at: string
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
