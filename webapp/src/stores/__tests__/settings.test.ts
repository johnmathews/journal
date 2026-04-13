import { describe, it, expect, vi, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useSettingsStore } from '../settings'
import type { HealthResponse, ServerSettings } from '@/types/settings'

const mockFetchSettings = vi.fn()
const mockFetchHealth = vi.fn()

vi.mock('@/api/settings', () => ({
  fetchSettings: (...args: unknown[]) => mockFetchSettings(...args),
  fetchHealth: (...args: unknown[]) => mockFetchHealth(...args),
}))

function makeSettings(): ServerSettings {
  return {
    ocr: { provider: 'anthropic', model: 'claude-opus-4-6' },
    transcription: { model: 'gpt-4o-transcribe' },
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
    features: {
      mood_scoring: false,
      mood_scorer_model: 'claude-sonnet-4-5',
      journal_author_name: 'John',
    },
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
})
