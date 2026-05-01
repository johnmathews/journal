import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createRouter, createMemoryHistory } from 'vue-router'
import AdminRuntimeView from '../AdminRuntimeView.vue'
import type { ServerSettings } from '@/types/settings'

const mockFetchSettings = vi.fn()
const mockFetchHealth = vi.fn()
const mockUpdateRuntimeSettings = vi.fn()

vi.mock('@/api/settings', () => ({
  fetchSettings: (...args: unknown[]) => mockFetchSettings(...args),
  fetchHealth: (...args: unknown[]) => mockFetchHealth(...args),
  updateRuntimeSettings: (...args: unknown[]) =>
    mockUpdateRuntimeSettings(...args),
}))

vi.mock('@/api/client', () => ({
  apiFetch: vi.fn(),
  ApiRequestError: class ApiRequestError extends Error {
    constructor(
      public status: number,
      public errorCode: string,
      message: string,
    ) {
      super(message)
      this.name = 'ApiRequestError'
    }
  },
}))

function makeSettings(overrides: Partial<ServerSettings> = {}): ServerSettings {
  return {
    ocr: { provider: 'gemini', model: 'gemini-3-pro' },
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
    },
    runtime: [],
    ...overrides,
  }
}

function makeRouter() {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      {
        path: '/admin/runtime',
        name: 'admin-runtime',
        component: AdminRuntimeView,
      },
    ],
  })
}

async function mountView(settings: ServerSettings = makeSettings()) {
  mockFetchSettings.mockResolvedValue(settings)
  mockFetchHealth.mockResolvedValue({
    status: 'ok',
    checks: [],
    ingestion: {
      total_entries: 0,
      total_words: 0,
      total_chunks: 0,
      avg_words_per_entry: 0,
      avg_chunks_per_entry: 0,
      last_ingested_at: null,
      entries_last_7d: 0,
      entries_last_30d: 0,
      by_source_type: {},
      row_counts: { entries: 0, entry_pages: 0, chunks: 0 },
    },
    queries: {
      total_queries: 0,
      uptime_seconds: 0,
      started_at: '2026-04-14T09:00:00Z',
      by_type: {},
    },
  })
  const pinia = createPinia()
  const router = makeRouter()
  await router.push('/admin/runtime')
  await router.isReady()
  const wrapper = mount(AdminRuntimeView, {
    global: { plugins: [pinia, router] },
  })
  await flushPromises()
  return wrapper
}

describe('AdminRuntimeView', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  it('renders the heading', async () => {
    const wrapper = await mountView()
    expect(wrapper.find('[data-testid="admin-runtime-heading"]').text()).toBe(
      'Runtime Settings',
    )
  })

  it('shows loading state initially', async () => {
    mockFetchSettings.mockReturnValue(new Promise(() => {}))
    mockFetchHealth.mockReturnValue(new Promise(() => {}))
    const router = makeRouter()
    await router.push('/admin/runtime')
    await router.isReady()
    const wrapper = mount(AdminRuntimeView, {
      global: { plugins: [createPinia(), router] },
    })
    await flushPromises()
    expect(wrapper.find('[data-testid="admin-runtime-loading"]').exists()).toBe(
      true,
    )
  })

  it('shows error state on API failure', async () => {
    mockFetchSettings.mockRejectedValue(new Error('Network error'))
    mockFetchHealth.mockRejectedValue(new Error('Network error'))
    const router = makeRouter()
    await router.push('/admin/runtime')
    await router.isReady()
    const wrapper = mount(AdminRuntimeView, {
      global: { plugins: [createPinia(), router] },
    })
    await flushPromises()
    expect(wrapper.find('[data-testid="admin-runtime-error"]').exists()).toBe(
      true,
    )
    expect(
      wrapper.find('[data-testid="admin-runtime-error"]').text(),
    ).toContain('Network error')
  })

  // --- Runtime toggles ---

  it('renders runtime settings section when runtime array is non-empty', async () => {
    const settings = makeSettings({
      runtime: [
        {
          key: 'preprocess_images',
          type: 'bool',
          label: 'Image Preprocessing',
          description: 'Auto-rotate, crop, downscale.',
          value: true,
        },
        {
          key: 'ocr_provider',
          type: 'string',
          label: 'OCR Provider',
          description: 'Primary OCR provider.',
          value: 'anthropic',
          choices: ['anthropic', 'gemini'],
        },
      ],
    })
    const wrapper = await mountView(settings)
    expect(
      wrapper.find('[data-testid="runtime-settings-section"]').exists(),
    ).toBe(true)
    expect(
      wrapper.find('[data-testid="runtime-preprocess_images"]').exists(),
    ).toBe(true)
    expect(wrapper.find('[data-testid="runtime-ocr_provider"]').exists()).toBe(
      true,
    )
  })

  it('does not render runtime section when runtime array is empty', async () => {
    const wrapper = await mountView(makeSettings({ runtime: [] }))
    expect(
      wrapper.find('[data-testid="runtime-settings-section"]').exists(),
    ).toBe(false)
  })

  it('toggles a boolean runtime setting on click', async () => {
    const runtimeItems = [
      {
        key: 'ocr_dual_pass',
        type: 'bool' as const,
        label: 'Dual-Pass OCR',
        description: 'Run both providers.',
        value: false,
      },
    ]
    mockUpdateRuntimeSettings.mockResolvedValue({
      updated: ['ocr_dual_pass'],
      settings: [{ ...runtimeItems[0], value: true }],
    })

    const wrapper = await mountView(makeSettings({ runtime: runtimeItems }))
    await wrapper.find('[data-testid="toggle-ocr_dual_pass"]').trigger('click')
    await flushPromises()

    expect(mockUpdateRuntimeSettings).toHaveBeenCalledWith({
      ocr_dual_pass: true,
    })
  })

  it('changes a string runtime setting via select', async () => {
    const runtimeItems = [
      {
        key: 'ocr_provider',
        type: 'string' as const,
        label: 'OCR Provider',
        description: 'Primary OCR provider.',
        value: 'anthropic',
        choices: ['anthropic', 'gemini'],
      },
    ]
    mockUpdateRuntimeSettings.mockResolvedValue({
      updated: ['ocr_provider'],
      settings: [{ ...runtimeItems[0], value: 'gemini' }],
    })

    const wrapper = await mountView(makeSettings({ runtime: runtimeItems }))
    const select = wrapper.find('[data-testid="select-ocr_provider"]')
    await select.setValue('gemini')
    await flushPromises()

    expect(mockUpdateRuntimeSettings).toHaveBeenCalledWith({
      ocr_provider: 'gemini',
    })
  })

  it('hides transcript_formatting from the runtime toggle list', async () => {
    const settings = makeSettings({
      runtime: [
        {
          key: 'transcript_formatting',
          type: 'bool',
          label: 'Paragraph Formatting',
          description: 'Format transcripts.',
          value: true,
        },
      ],
    })
    const wrapper = await mountView(settings)
    expect(
      wrapper.find('[data-testid="runtime-transcript_formatting"]').exists(),
    ).toBe(false)
  })

  it('toggles transcript_formatting from the audio sub-card', async () => {
    const runtimeItems = [
      {
        key: 'transcript_formatting',
        type: 'bool' as const,
        label: 'Paragraph Formatting',
        description: 'Format transcripts.',
        value: false,
      },
    ]
    mockUpdateRuntimeSettings.mockResolvedValue({
      updated: ['transcript_formatting'],
      settings: [{ ...runtimeItems[0], value: true }],
    })
    const wrapper = await mountView(makeSettings({ runtime: runtimeItems }))
    await wrapper
      .find('[data-testid="transcript-formatting-toggle"]')
      .trigger('click')
    await flushPromises()

    expect(mockUpdateRuntimeSettings).toHaveBeenCalledWith({
      transcript_formatting: true,
    })
  })

  // --- Pipeline read-only sub-cards ---

  it('renders all pipeline sub-cards', async () => {
    const wrapper = await mountView()
    expect(wrapper.find('[data-testid="section-ocr-ingestion"]').exists()).toBe(
      true,
    )
    expect(
      wrapper.find('[data-testid="section-audio-ingestion"]').exists(),
    ).toBe(true)
    expect(wrapper.find('[data-testid="section-chunking"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="section-mood"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="section-entity"]').exists()).toBe(true)
  })

  it('displays OCR provider and model from store', async () => {
    const wrapper = await mountView()
    expect(wrapper.find('[data-testid="ocr-provider"]').text()).toBe('gemini')
    expect(wrapper.find('[data-testid="ocr-model"]').text()).toBe(
      'gemini-3-pro',
    )
  })

  it('displays chunking config', async () => {
    const wrapper = await mountView()
    const chunking = wrapper.find('[data-testid="section-chunking"]')
    expect(chunking.text()).toContain('semantic')
    expect(chunking.text()).toContain('150')
    expect(chunking.text()).toContain('text-embedding-3-large')
    expect(chunking.text()).toContain('1024')
  })

  it('displays entity extraction config', async () => {
    const wrapper = await mountView()
    const entity = wrapper.find('[data-testid="section-entity"]')
    expect(entity.text()).toContain('claude-opus-4-6')
    expect(entity.text()).toContain('0.88')
  })

  it('does not render Author Name field (moved to /settings)', async () => {
    const wrapper = await mountView()
    expect(wrapper.find('[data-testid="author-name-field"]').exists()).toBe(
      false,
    )
  })

  it('renders transcription provider in audio sub-card', async () => {
    const wrapper = await mountView()
    expect(wrapper.find('[data-testid="transcription-provider"]').text()).toBe(
      'openai',
    )
  })

  it('renders fallback details when fallback is enabled', async () => {
    const wrapper = await mountView()
    const fallback = wrapper.find('[data-testid="transcription-fallback"]')
    expect(fallback.text()).toContain('whisper-1')
    expect(fallback.text()).toContain('after 3')
    expect(fallback.text()).toContain('retries')
  })

  it('renders fallback as disabled when fallback is off', async () => {
    const wrapper = await mountView(
      makeSettings({
        transcription: {
          provider: 'openai',
          model: 'gpt-4o-transcribe',
          fallback: { enabled: false, model: 'whisper-1' },
          shadow: { enabled: false, provider: null, model: null },
          retry: {
            max_attempts: 3,
            base_delay_seconds: 1.0,
            max_delay_seconds: 30.0,
          },
        },
      }),
    )
    expect(
      wrapper.find('[data-testid="transcription-fallback"]').text(),
    ).toContain('disabled')
  })

  it('renders shadow as off when shadow is disabled', async () => {
    const wrapper = await mountView()
    expect(
      wrapper.find('[data-testid="transcription-shadow"]').text(),
    ).toContain('off')
  })

  it('renders shadow provider/model when shadow is enabled', async () => {
    const wrapper = await mountView(
      makeSettings({
        transcription: {
          provider: 'openai',
          model: 'gpt-4o-transcribe',
          fallback: { enabled: true, model: 'whisper-1' },
          shadow: {
            enabled: true,
            provider: 'gemini',
            model: 'gemini-2.5-pro',
          },
          retry: {
            max_attempts: 3,
            base_delay_seconds: 1.0,
            max_delay_seconds: 30.0,
          },
        },
      }),
    )
    const shadow = wrapper.find('[data-testid="transcription-shadow"]')
    expect(shadow.text()).toContain('gemini')
    expect(shadow.text()).toContain('gemini-2.5-pro')
  })

  it('shows mood scorer model when mood scoring is enabled', async () => {
    const wrapper = await mountView(
      makeSettings({
        features: {
          mood_scoring: true,
          mood_scorer_model: 'claude-sonnet-4-5',
          journal_author_name: 'John',
        },
      }),
    )
    const mood = wrapper.find('[data-testid="section-mood"]')
    expect(mood.text()).toContain('claude-sonnet-4-5')
    expect(wrapper.find('[data-testid="mood-cost"]').exists()).toBe(true)
  })

  it('shows disabled badge when mood scoring is off', async () => {
    const wrapper = await mountView(
      makeSettings({
        features: {
          mood_scoring: false,
          mood_scorer_model: 'claude-sonnet-4-5',
          journal_author_name: 'John',
        },
      }),
    )
    const mood = wrapper.find('[data-testid="section-mood"]')
    expect(mood.text()).toContain('Disabled')
    expect(mood.text()).not.toContain('claude-sonnet-4-5')
    expect(wrapper.find('[data-testid="mood-cost"]').exists()).toBe(false)
  })

  it('displays cost badges on every sub-card', async () => {
    const wrapper = await mountView()
    expect(wrapper.find('[data-testid="ocr-ingestion-cost"]').text()).toContain(
      '/1k words',
    )
    expect(
      wrapper.find('[data-testid="audio-ingestion-cost"]').text(),
    ).toContain('/1k words')
    expect(wrapper.find('[data-testid="chunking-cost"]').text()).toContain(
      '/1k words',
    )
    expect(wrapper.find('[data-testid="mood-cost"]').text()).toContain(
      '/1k words',
    )
    expect(wrapper.find('[data-testid="entity-cost"]').text()).toContain(
      '/1k words',
    )
  })
})
