/**
 * Cost estimation for journal processing pipeline.
 *
 * All LLM prices are in $/MTok (per million tokens).
 * Transcription prices are in $/minute.
 *
 * Default pricing is hardcoded as a fallback. When server-stored pricing
 * is available (from /api/settings), pass it via the `pricing` parameter
 * to use live values. The server pricing table is the source of truth —
 * update it in Settings > API Pricing when providers change their rates.
 *
 * Last verified: 2026-04-23
 */

// ── Pricing types ───────────────────────────────────────────────────

export interface ModelPricing {
  input: number // $/MTok
  output: number // $/MTok
}

export interface PricingConfig {
  models: Record<string, ModelPricing>
  transcription: Record<string, number> // $/minute
}

// ── Default pricing (fallback when server data is unavailable) ──────

/** Default LLM and embedding model pricing ($/MTok). */
export const DEFAULT_MODEL_PRICING: Record<string, ModelPricing> = {
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

/** Default transcription model pricing ($/minute). */
export const DEFAULT_TRANSCRIPTION_PRICING: Record<string, number> = {
  'gpt-4o-transcribe': 0.006,
  'gpt-4o-mini-transcribe': 0.003,
}

export const DEFAULT_PRICING: PricingConfig = {
  models: DEFAULT_MODEL_PRICING,
  transcription: DEFAULT_TRANSCRIPTION_PRICING,
}

/**
 * Dual-pass OCR always uses both default models regardless of ocr_provider.
 * Must match _DEFAULT_MODELS in journal-server/src/journal/providers/ocr.py.
 */
export const DUAL_PASS_MODELS = {
  primary: 'claude-opus-4-6',
  secondary: 'gemini-2.5-pro',
} as const

// ── Token assumptions (project-specific, not provider pricing) ──────

const OCR_INPUT_TOKENS_PER_PAGE = 2100 // ~1600 image + ~500 system prompt
const OCR_OUTPUT_TOKENS_PER_PAGE = 800

const WORDS_PER_ENTRY = 500
const MOOD_INPUT_TOKENS = 1750
const MOOD_OUTPUT_TOKENS = 200
const ENTITY_INPUT_TOKENS = 1550
const ENTITY_OUTPUT_TOKENS = 500
const ENTITY_DEDUP_TOKENS = 30

const CHUNKING_EMBED_TOKENS = 650 // sentence embeddings for boundary detection
const CHUNK_EMBED_TOKENS = 850 // final chunk embeddings

const WORDS_PER_PAGE = 300 // handwritten journal page
const WORDS_PER_MINUTE_SPEAKING = 150 // average speaking rate
const FORMATTING_INPUT_TOKENS_PER_1K_WORDS = 1400
const FORMATTING_OUTPUT_TOKENS_PER_1K_WORDS = 1500

// ── Internal helpers ────────────────────────────────────────────────

function tokenCost(
  inputTokens: number,
  outputTokens: number,
  pricing: ModelPricing,
): number {
  return (
    (inputTokens * pricing.input + outputTokens * pricing.output) / 1_000_000
  )
}

function embeddingCost(tokens: number, pricing: ModelPricing): number {
  return (tokens * pricing.input) / 1_000_000
}

function lookupModel(
  model: string,
  pricing: PricingConfig,
): ModelPricing | null {
  return pricing.models[model] ?? null
}

function lookupTranscription(
  model: string,
  pricing: PricingConfig,
): number | null {
  return pricing.transcription[model] ?? null
}

// ── Per-unit cost functions ─────────────────────────────────────────

/** Cost of OCR for one handwritten page. */
export function ocrCostPerPage(
  model: string,
  pricing: PricingConfig = DEFAULT_PRICING,
): number | null {
  const p = lookupModel(model, pricing)
  if (!p) return null
  return tokenCost(OCR_INPUT_TOKENS_PER_PAGE, OCR_OUTPUT_TOKENS_PER_PAGE, p)
}

/** Cost of transcription per minute. */
export function transcriptionCostPerMinute(
  model: string,
  pricing: PricingConfig = DEFAULT_PRICING,
): number | null {
  return lookupTranscription(model, pricing)
}

/** Cost of chunking + embedding per entry (~500 words). */
export function chunkingCostPerEntry(
  embeddingModel: string,
  pricing: PricingConfig = DEFAULT_PRICING,
): number | null {
  const p = lookupModel(embeddingModel, pricing)
  if (!p) return null
  return embeddingCost(CHUNKING_EMBED_TOKENS + CHUNK_EMBED_TOKENS, p)
}

/** Cost of mood scoring per entry (~500 words). */
export function moodScoringCostPerEntry(
  model: string,
  pricing: PricingConfig = DEFAULT_PRICING,
): number | null {
  const p = lookupModel(model, pricing)
  if (!p) return null
  return tokenCost(MOOD_INPUT_TOKENS, MOOD_OUTPUT_TOKENS, p)
}

/** Cost of entity extraction per entry (~500 words), including dedup embedding. */
export function entityExtractionCostPerEntry(
  extractionModel: string,
  embeddingModel: string,
  pricing: PricingConfig = DEFAULT_PRICING,
): number | null {
  const extractP = lookupModel(extractionModel, pricing)
  const embedP = lookupModel(embeddingModel, pricing)
  if (!extractP || !embedP) return null
  const llmCost = tokenCost(
    ENTITY_INPUT_TOKENS,
    ENTITY_OUTPUT_TOKENS,
    extractP,
  )
  const dedupCost = embeddingCost(ENTITY_DEDUP_TOKENS, embedP)
  return llmCost + dedupCost
}

// ── Per-1000-words functions ────────────────────────────────────────

/** OCR cost per 1000 words. */
export function ocrCostPer1000Words(
  model: string,
  pricing: PricingConfig = DEFAULT_PRICING,
): number | null {
  const perPage = ocrCostPerPage(model, pricing)
  if (perPage === null) return null
  return perPage * (1000 / WORDS_PER_PAGE)
}

/** Audio ingestion cost per 1000 words (transcription + optional formatting). */
export function audioCostPer1000Words(
  transcriptionModel: string,
  formattingEnabled: boolean,
  formattingModel: string | null,
  pricing: PricingConfig = DEFAULT_PRICING,
): number | null {
  const perMinute = lookupTranscription(transcriptionModel, pricing)
  if (perMinute === null) return null
  const transcriptionCost = perMinute * (1000 / WORDS_PER_MINUTE_SPEAKING)

  if (!formattingEnabled || !formattingModel) return transcriptionCost

  const p = lookupModel(formattingModel, pricing)
  if (!p) return transcriptionCost // unknown model — show transcription only
  const formattingCost = tokenCost(
    FORMATTING_INPUT_TOKENS_PER_1K_WORDS,
    FORMATTING_OUTPUT_TOKENS_PER_1K_WORDS,
    p,
  )
  return transcriptionCost + formattingCost
}

/** Chunking + embedding cost per 1000 words. */
export function chunkingCostPer1000Words(
  embeddingModel: string,
  pricing: PricingConfig = DEFAULT_PRICING,
): number | null {
  const perEntry = chunkingCostPerEntry(embeddingModel, pricing)
  if (perEntry === null) return null
  return perEntry * (1000 / WORDS_PER_ENTRY)
}

/** Mood scoring cost per 1000 words. */
export function moodScoringCostPer1000Words(
  model: string,
  pricing: PricingConfig = DEFAULT_PRICING,
): number | null {
  const perEntry = moodScoringCostPerEntry(model, pricing)
  if (perEntry === null) return null
  return perEntry * (1000 / WORDS_PER_ENTRY)
}

/** Entity extraction cost per 1000 words. */
export function entityExtractionCostPer1000Words(
  extractionModel: string,
  embeddingModel: string,
  pricing: PricingConfig = DEFAULT_PRICING,
): number | null {
  const perEntry = entityExtractionCostPerEntry(
    extractionModel,
    embeddingModel,
    pricing,
  )
  if (perEntry === null) return null
  return perEntry * (1000 / WORDS_PER_ENTRY)
}

/** OCR cost per 1000 words for dual-pass (sum of both models). */
export function ocrDualPassCostPer1000Words(
  pricing: PricingConfig = DEFAULT_PRICING,
): number | null {
  const primary = ocrCostPer1000Words(DUAL_PASS_MODELS.primary, pricing)
  const secondary = ocrCostPer1000Words(DUAL_PASS_MODELS.secondary, pricing)
  if (primary === null || secondary === null) return null
  return primary + secondary
}

// ── Total cost functions ────────────────────────────────────────────

/** Total image ingestion cost per 1000 words (OCR + chunking + mood + entities).
 *  When secondaryOcrModel is provided, OCR cost includes both models (dual-pass). */
export function totalImageIngestionCostPer1000Words(
  ocrModel: string,
  embeddingModel: string,
  moodModel: string | null,
  entityModel: string,
  secondaryOcrModel?: string,
  pricing: PricingConfig = DEFAULT_PRICING,
): number | null {
  const ocrPrimary = ocrCostPer1000Words(ocrModel, pricing)
  const chunking = chunkingCostPer1000Words(embeddingModel, pricing)
  const entity = entityExtractionCostPer1000Words(
    entityModel,
    embeddingModel,
    pricing,
  )
  if (ocrPrimary === null || chunking === null || entity === null) return null
  let ocrTotal = ocrPrimary
  if (secondaryOcrModel) {
    const ocrSecondary = ocrCostPer1000Words(secondaryOcrModel, pricing)
    if (ocrSecondary === null) return null
    ocrTotal += ocrSecondary
  }
  const mood = moodModel
    ? moodScoringCostPer1000Words(moodModel, pricing)
    : 0
  if (mood === null) return null
  return ocrTotal + chunking + mood + entity
}

/** Total audio ingestion cost per 1000 words (transcription + chunking + mood + entities). */
export function totalAudioIngestionCostPer1000Words(
  transcriptionModel: string,
  formattingEnabled: boolean,
  formattingModel: string | null,
  embeddingModel: string,
  moodModel: string | null,
  entityModel: string,
  pricing: PricingConfig = DEFAULT_PRICING,
): number | null {
  const audio = audioCostPer1000Words(
    transcriptionModel,
    formattingEnabled,
    formattingModel,
    pricing,
  )
  const chunking = chunkingCostPer1000Words(embeddingModel, pricing)
  const entity = entityExtractionCostPer1000Words(
    entityModel,
    embeddingModel,
    pricing,
  )
  if (audio === null || chunking === null || entity === null) return null
  const mood = moodModel
    ? moodScoringCostPer1000Words(moodModel, pricing)
    : 0
  if (mood === null) return null
  return audio + chunking + mood + entity
}

/** Total edit cost per 1000 words (re-chunking + mood + entities, no OCR). */
export function totalEditCostPer1000Words(
  embeddingModel: string,
  moodModel: string | null,
  entityModel: string,
  pricing: PricingConfig = DEFAULT_PRICING,
): number | null {
  const chunking = chunkingCostPer1000Words(embeddingModel, pricing)
  const entity = entityExtractionCostPer1000Words(
    entityModel,
    embeddingModel,
    pricing,
  )
  if (chunking === null || entity === null) return null
  const mood = moodModel
    ? moodScoringCostPer1000Words(moodModel, pricing)
    : 0
  if (mood === null) return null
  return chunking + mood + entity
}

// ── Formatting ──────────────────────────────────────────────────────

/** Format a dollar cost as a human-readable string. */
export function formatCost(cost: number | null): string {
  if (cost === null) return '—'
  if (cost < 0.001) return '<$0.001'
  if (cost < 0.01) return `~$${cost.toFixed(3)}`
  return `~$${cost.toFixed(2)}`
}
