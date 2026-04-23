export interface ServerSettings {
  ocr: {
    provider: string
    model: string
  }
  transcription: {
    model: string
  }
  transcript_formatting: {
    model: string
  }
  embedding: {
    model: string
    dimensions: number
  }
  chunking: {
    strategy: string
    max_tokens: number
    min_tokens: number
    overlap_tokens: number
    boundary_percentile: number
    decisive_percentile: number
    embed_metadata_prefix: boolean
  }
  entity_extraction: {
    model: string
    dedup_similarity_threshold: number
  }
  features: {
    mood_scoring: boolean
    mood_scorer_model: string
    journal_author_name: string
  }
  runtime: RuntimeSetting[]
}

export interface RuntimeSetting {
  key: string
  type: 'bool' | 'string'
  label: string
  description: string
  value: boolean | string
  choices?: string[]
}

export interface ComponentCheck {
  name: string
  status: string
  detail: string
}

export interface HealthResponse {
  status: string
  checks: ComponentCheck[]
  ingestion: {
    total_entries: number
    total_words: number
    total_chunks: number
    avg_words_per_entry: number
    avg_chunks_per_entry: number
    last_ingested_at: string | null
    entries_last_7d: number
    entries_last_30d: number
    by_source_type: Record<string, number>
    row_counts: Record<string, number>
  }
  queries: {
    total_queries: number
    uptime_seconds: number
    started_at: string | null
    by_type: Record<
      string,
      {
        count: number
        latency: { p50_ms: number; p95_ms: number; p99_ms: number }
      }
    >
  }
}
