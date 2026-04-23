import { describe, it, expect, vi, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useSettingsStore } from '../settings'
import type { HealthResponse, ServerSettings } from '@/types/settings'

const mockFetchSettings = vi.fn()
const mockFetchHealth = vi.fn()
const mockUpdateRuntimeSettings = vi.fn()
const mockUpdatePricing = vi.fn()

vi.mock('@/api/settings', () => ({
  fetchSettings: (...args: unknown[]) => mockFetchSettings(...args),
  fetchHealth: (...args: unknown[]) => mockFetchHealth(...args),
  updateRuntimeSettings: (...args: unknown[]) =>
    mockUpdateRuntimeSettings(...args),
  updatePricing: (...args: unknown[]) => mockUpdatePricing(...args),
}))

function makeSettings(): ServerSettings {
  return {
    ocr: { provider: 'anthropic', model: 'claude-opus-4-6' },
    transcription: { model: 'gpt-4o-transcribe' },
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
      mood_scoring: false,
      mood_scorer_model: 'claude-sonnet-4-5',
      journal_author_name: 'John',
    },
    runtime: [
      {
        key: 'preprocess_images',
        type: 'bool' as const,
        label: 'Image Preprocessing',
        description: 'Auto-rotate, crop, downscale, enhance.',
        value: true,
      },
      {
        key: 'ocr_dual_pass',
        type: 'bool' as const,
        label: 'Dual-Pass OCR',
        description: 'Run both providers.',
        value: false,
      },
    ],
  }
}

function makeHealth(): HealthResponse {
  return {
    status: 'ok',
    checks: [{ name: 'sqlite', status: 'ok', detail: '' }],
    ingestion: {
      total_entries: 10,
      total_words: 5000,
      total_chunks: 50,
      avg_words_per_entry: 500,
      avg_chunks_per_entry: 5,
      last_ingested_at: null,
      entries_last_7d: 2,
      entries_last_30d: 8,
      by_source_type: {},
      row_counts: {},
    },
    queries: {
      total_queries: 0,
      uptime_seconds: 120,
      started_at: null,
      by_type: {},
    },
  }
}

describe('useSettingsStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  it('starts with null settings and health', () => {
    const store = useSettingsStore()
    expect(store.settings).toBeNull()
    expect(store.health).toBeNull()
    expect(store.loading).toBe(false)
    expect(store.error).toBeNull()
  })

  it('loads settings and health in parallel', async () => {
    mockFetchSettings.mockResolvedValue(makeSettings())
    mockFetchHealth.mockResolvedValue(makeHealth())

    const store = useSettingsStore()
    await store.load()

    expect(store.settings).not.toBeNull()
    expect(store.settings!.ocr.provider).toBe('anthropic')
    expect(store.health).not.toBeNull()
    expect(store.health!.status).toBe('ok')
    expect(store.loading).toBe(false)
    expect(store.error).toBeNull()
  })

  it('sets error on failure', async () => {
    mockFetchSettings.mockRejectedValue(new Error('Server down'))
    mockFetchHealth.mockRejectedValue(new Error('Server down'))

    const store = useSettingsStore()
    await store.load()

    expect(store.settings).toBeNull()
    expect(store.health).toBeNull()
    expect(store.error).toBe('Server down')
    expect(store.loading).toBe(false)
  })

  it('handles ApiRequestError', async () => {
    const { ApiRequestError } = await import('@/api/client')
    mockFetchSettings.mockRejectedValue(
      new ApiRequestError(503, 'unavailable', 'Service Unavailable'),
    )
    mockFetchHealth.mockRejectedValue(new Error('fail'))

    const store = useSettingsStore()
    await store.load()

    expect(store.error).toBe('Service Unavailable')
  })

  it('handles non-Error throw', async () => {
    mockFetchSettings.mockRejectedValue('string error')
    mockFetchHealth.mockRejectedValue('string error')

    const store = useSettingsStore()
    await store.load()

    expect(store.error).toBe('Failed to load settings')
  })

  it('sets loading during fetch', async () => {
    let resolve: (v: unknown) => void
    mockFetchSettings.mockReturnValue(
      new Promise((r) => {
        resolve = r
      }),
    )
    mockFetchHealth.mockResolvedValue(makeHealth())

    const store = useSettingsStore()
    const p = store.load()
    expect(store.loading).toBe(true)

    resolve!(makeSettings())
    await p
    expect(store.loading).toBe(false)
  })

  it('pricingConfig returns defaults when no pricing data', () => {
    const store = useSettingsStore()
    const config = store.pricingConfig
    expect(config.models['claude-opus-4-6']).toBeDefined()
    expect(config.transcription['gpt-4o-transcribe']).toBe(0.006)
  })

  it('pricingConfig merges server pricing over defaults', async () => {
    const settings = makeSettings()
    settings.pricing = [
      {
        model: 'claude-opus-4-6',
        category: 'llm',
        input_cost_per_mtok: 6.0,
        output_cost_per_mtok: 30.0,
        cost_per_minute: null,
        last_verified: '2026-05-01',
      },
      {
        model: 'gpt-4o-transcribe',
        category: 'transcription',
        input_cost_per_mtok: null,
        output_cost_per_mtok: null,
        cost_per_minute: 0.008,
        last_verified: '2026-05-01',
      },
    ]
    mockFetchSettings.mockResolvedValue(settings)
    mockFetchHealth.mockResolvedValue(makeHealth())

    const store = useSettingsStore()
    await store.load()

    const config = store.pricingConfig
    expect(config.models['claude-opus-4-6'].input).toBe(6.0)
    expect(config.models['claude-opus-4-6'].output).toBe(30.0)
    expect(config.transcription['gpt-4o-transcribe']).toBe(0.008)
    // Non-overridden models keep defaults
    expect(config.models['gemini-2.5-pro'].input).toBe(1.25)
  })

  it('updatePricing patches pricing in settings', async () => {
    const settings = makeSettings()
    settings.pricing = [
      {
        model: 'claude-opus-4-6',
        category: 'llm',
        input_cost_per_mtok: 5.0,
        output_cost_per_mtok: 25.0,
        cost_per_minute: null,
        last_verified: '2026-04-23',
      },
    ]
    mockFetchSettings.mockResolvedValue(settings)
    mockFetchHealth.mockResolvedValue(makeHealth())

    const updatedPricing = [
      {
        model: 'claude-opus-4-6',
        category: 'llm',
        input_cost_per_mtok: 6.0,
        output_cost_per_mtok: 30.0,
        cost_per_minute: null,
        last_verified: '2026-05-01',
      },
    ]
    mockUpdatePricing.mockResolvedValue({
      updated: ['claude-opus-4-6'],
      pricing: updatedPricing,
    })

    const store = useSettingsStore()
    await store.load()
    await store.updatePricing({
      'claude-opus-4-6': { input_cost_per_mtok: 6.0 },
    })

    expect(store.settings!.pricing![0].input_cost_per_mtok).toBe(6.0)
  })

  it('updateRuntime does not crash when settings is null', async () => {
    const updatedRuntime = [
      {
        key: 'preprocess_images',
        type: 'bool',
        label: 'Image Preprocessing',
        description: 'Auto-rotate, crop, downscale, enhance.',
        value: false,
      },
    ]
    mockUpdateRuntimeSettings.mockResolvedValue({
      updated: ['preprocess_images'],
      settings: updatedRuntime,
    })

    const store = useSettingsStore()
    // settings.value is null by default — exercise the `if (settings.value)` false branch
    await store.updateRuntime({ preprocess_images: false })

    expect(mockUpdateRuntimeSettings).toHaveBeenCalledWith({
      preprocess_images: false,
    })
    // settings remains null — the store did not try to spread into null
    expect(store.settings).toBeNull()
    expect(store.updating).toBe(false)
  })

  it('updatePricing does not crash when settings is null', async () => {
    mockUpdatePricing.mockResolvedValue({
      updated: ['claude-opus-4-6'],
      pricing: [],
    })

    const store = useSettingsStore()
    // settings.value is null — exercise the `if (settings.value)` false branch
    await store.updatePricing({
      'claude-opus-4-6': { input_cost_per_mtok: 7.0 },
    })

    expect(mockUpdatePricing).toHaveBeenCalledWith({
      'claude-opus-4-6': { input_cost_per_mtok: 7.0 },
    })
    expect(store.settings).toBeNull()
    expect(store.updating).toBe(false)
  })

  it('pricingConfig falls back to 0 when output_cost_per_mtok is null', async () => {
    const settings = makeSettings()
    settings.pricing = [
      {
        model: 'custom-model',
        category: 'llm',
        input_cost_per_mtok: 2.0,
        output_cost_per_mtok: null,
        cost_per_minute: null,
        last_verified: '2026-05-01',
      },
    ]
    mockFetchSettings.mockResolvedValue(settings)
    mockFetchHealth.mockResolvedValue(makeHealth())

    const store = useSettingsStore()
    await store.load()

    const config = store.pricingConfig
    expect(config.models['custom-model'].input).toBe(2.0)
    expect(config.models['custom-model'].output).toBe(0)
  })

  it('pricingConfig skips entries with no input_cost_per_mtok and non-transcription category', async () => {
    const settings = makeSettings()
    settings.pricing = [
      {
        model: 'unknown-model',
        category: 'other',
        input_cost_per_mtok: null,
        output_cost_per_mtok: null,
        cost_per_minute: null,
        last_verified: '2026-05-01',
      },
    ]
    mockFetchSettings.mockResolvedValue(settings)
    mockFetchHealth.mockResolvedValue(makeHealth())

    const store = useSettingsStore()
    await store.load()

    const config = store.pricingConfig
    // The entry should be skipped entirely — unknown-model should not appear
    expect(config.models['unknown-model']).toBeUndefined()
  })

  it('pricingConfig returns defaults when pricing is an empty array', async () => {
    const settings = makeSettings()
    settings.pricing = []
    mockFetchSettings.mockResolvedValue(settings)
    mockFetchHealth.mockResolvedValue(makeHealth())

    const store = useSettingsStore()
    await store.load()

    const { DEFAULT_PRICING } = await import('@/utils/cost-estimates')
    expect(store.pricingConfig).toEqual(DEFAULT_PRICING)
  })

  it('updateRuntime patches settings and refreshes runtime array', async () => {
    mockFetchSettings.mockResolvedValue(makeSettings())
    mockFetchHealth.mockResolvedValue(makeHealth())

    const updatedRuntime = [
      {
        key: 'preprocess_images',
        type: 'bool',
        label: 'Image Preprocessing',
        description: 'Auto-rotate, crop, downscale, enhance.',
        value: true,
      },
      {
        key: 'ocr_dual_pass',
        type: 'bool',
        label: 'Dual-Pass OCR',
        description: 'Run both providers.',
        value: true,
      },
    ]
    mockUpdateRuntimeSettings.mockResolvedValue({
      updated: ['ocr_dual_pass'],
      settings: updatedRuntime,
    })

    const store = useSettingsStore()
    await store.load()
    await store.updateRuntime({ ocr_dual_pass: true })

    expect(mockUpdateRuntimeSettings).toHaveBeenCalledWith({
      ocr_dual_pass: true,
    })
    expect(store.settings!.runtime[1].value).toBe(true)
  })
})
