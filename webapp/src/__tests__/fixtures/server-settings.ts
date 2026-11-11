import type { ServerSettings } from '@/types/settings'

/**
 * Canonical ServerSettings fixture for specs that hydrate the settings
 * store (feature-flag readers like the Strava-mothball gating). Mirrors
 * the prod default of `features.strava_enabled: false`; use
 * `makeServerSettingsWithStrava(true)` for flag-on scenarios.
 */
export function makeServerSettings(
  overrides: Partial<ServerSettings> = {},
): ServerSettings {
  return {
    ocr: { provider: 'gemini', model: 'gemini-2.5-pro' },
    transcription: {
      provider: 'openai',
      model: 'gpt-4o-transcribe',
      fallback: { enabled: true, model: 'whisper-1' },
      shadow: { enabled: false, provider: null, model: null },
      retry: {
        max_attempts: 3,
        base_delay_seconds: 1.0,
        max_delay_seconds: 30.0,
      },
    },
    transcript_formatting: { model: 'claude-haiku-4-5' },
    embedding: { model: 'text-embedding-3-large', dimensions: 1024 },
    chunking: {
      strategy: 'semantic',
      max_tokens: 150,
      min_tokens: 30,
      overlap_tokens: 40,
      boundary_percentile: 25,
      decisive_percentile: 10,
      embed_metadata_prefix: true,
    },
    entity_extraction: {
      model: 'claude-opus-4-6',
      dedup_similarity_threshold: 0.88,
    },
    features: {
      mood_scoring: true,
      mood_scorer_model: 'claude-sonnet-4-5',
      journal_author_name: 'John',
      strava_enabled: false,
    },
    runtime: [],
    ...overrides,
  }
}

/** Fixture with the Strava feature flag explicitly set. */
export function makeServerSettingsWithStrava(enabled: boolean): ServerSettings {
  const settings = makeServerSettings()
  settings.features.strava_enabled = enabled
  return settings
}
