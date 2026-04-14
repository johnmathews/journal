/**
 * Cost estimation for journal processing pipeline.
 *
 * Pricing data sourced from docs/external-services.md.
 * All LLM prices are in $/MTok (per million tokens).
 * Transcription prices are in $/minute.
 */

interface LlmPricing {
  input: number // $/MTok
  output: number // $/MTok
}

/** LLM and embedding model pricing ($/MTok). */
const MODEL_PRICING: Record<string, LlmPricing> = {
  // Anthropic
  'claude-opus-4-6': { input: 5.0, output: 25.0 },
  'claude-sonnet-4-6': { input: 3.0, output: 15.0 },
  'claude-sonnet-4-5': { input: 3.0, output: 15.0 },
  'claude-haiku-4-5': { input: 1.0, output: 5.0 },
  // Google
  'gemini-2.5-pro': { input: 1.25, output: 10.0 },
  'gemini-2.5-flash': { input: 0.3, output: 2.5 },
  // OpenAI
  'gpt-5.4': { input: 2.5, output: 15.0 },
  'gpt-4.1': { input: 2.0, output: 8.0 },
  // Embeddings (output cost is always 0)
  'text-embedding-3-large': { input: 0.13, output: 0 },
  'text-embedding-3-small': { input: 0.02, output: 0 },
}

/** Transcription model pricing ($/minute). */
const TRANSCRIPTION_PRICING: Record<string, number> = {
  'gpt-4o-transcribe': 0.006,
  'gpt-4o-mini-transcribe': 0.003,
}

// Token assumptions from docs/external-services.md per-page estimates
const OCR_INPUT_TOKENS_PER_PAGE = 2100 // ~1600 image + ~500 system prompt
const OCR_OUTPUT_TOKENS_PER_PAGE = 800

// Token assumptions for enrichment (per ~500 word entry)
const MOOD_INPUT_TOKENS = 1750
const MOOD_OUTPUT_TOKENS = 200
const ENTITY_INPUT_TOKENS = 1550
const ENTITY_OUTPUT_TOKENS = 500
const ENTITY_DEDUP_TOKENS = 30

// Chunking + embedding tokens (per ~500 word entry, ~25 sentences, ~4 chunks)
const CHUNKING_EMBED_TOKENS = 650 // sentence embeddings for boundary detection
const CHUNK_EMBED_TOKENS = 850 // final chunk embeddings

function tokenCost(
  inputTokens: number,
  outputTokens: number,
  pricing: LlmPricing,
): number {
  return (
    (inputTokens * pricing.input + outputTokens * pricing.output) / 1_000_000
  )
}

function embeddingCost(tokens: number, pricing: LlmPricing): number {
  return (tokens * pricing.input) / 1_000_000
}

/** Cost of OCR for one handwritten page. Returns null if model is unknown. */
export function ocrCostPerPage(model: string): number | null {
  const pricing = MODEL_PRICING[model]
  if (!pricing) return null
  return tokenCost(
    OCR_INPUT_TOKENS_PER_PAGE,
    OCR_OUTPUT_TOKENS_PER_PAGE,
    pricing,
  )
}

/** Cost of transcription per minute. Returns null if model is unknown. */
export function transcriptionCostPerMinute(model: string): number | null {
  return TRANSCRIPTION_PRICING[model] ?? null
}

/** Cost of chunking + embedding per entry (~500 words). Returns null if model is unknown. */
export function chunkingCostPerEntry(embeddingModel: string): number | null {
  const pricing = MODEL_PRICING[embeddingModel]
  if (!pricing) return null
  return embeddingCost(CHUNKING_EMBED_TOKENS + CHUNK_EMBED_TOKENS, pricing)
}

/** Cost of mood scoring per entry (~500 words). Returns null if model is unknown. */
export function moodScoringCostPerEntry(model: string): number | null {
  const pricing = MODEL_PRICING[model]
  if (!pricing) return null
  return tokenCost(MOOD_INPUT_TOKENS, MOOD_OUTPUT_TOKENS, pricing)
}

/** Cost of entity extraction per entry (~500 words), including dedup embedding. */
export function entityExtractionCostPerEntry(
  extractionModel: string,
  embeddingModel: string,
): number | null {
  const extractPricing = MODEL_PRICING[extractionModel]
  const embedPricing = MODEL_PRICING[embeddingModel]
  if (!extractPricing || !embedPricing) return null
  const llmCost = tokenCost(
    ENTITY_INPUT_TOKENS,
    ENTITY_OUTPUT_TOKENS,
    extractPricing,
  )
  const dedupCost = embeddingCost(ENTITY_DEDUP_TOKENS, embedPricing)
  return llmCost + dedupCost
}

/** Format a dollar cost as a human-readable string. */
export function formatCost(cost: number | null): string {
  if (cost === null) return '—'
  if (cost < 0.001) return '<$0.001'
  if (cost < 0.01) return `~$${cost.toFixed(3)}`
  return `~$${cost.toFixed(2)}`
}
