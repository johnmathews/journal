import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createRouter, createMemoryHistory } from 'vue-router'
import AdminPricingView from '../AdminPricingView.vue'
import type { ServerSettings, PricingEntry } from '@/types/settings'

const mockFetchSettings = vi.fn()
const mockFetchHealth = vi.fn()
const mockUpdatePricing = vi.fn()

vi.mock('@/api/settings', () => ({
  fetchSettings: (...args: unknown[]) => mockFetchSettings(...args),
  fetchHealth: (...args: unknown[]) => mockFetchHealth(...args),
  updatePricing: (...args: unknown[]) => mockUpdatePricing(...args),
  updateRuntimeSettings: vi.fn(),
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

function makeSettings(pricing: PricingEntry[]): ServerSettings {
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
    pricing,
  }
}

function makeRouter() {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      {
        path: '/admin/pricing',
        name: 'admin-pricing',
        component: AdminPricingView,
      },
    ],
  })
}

async function mountView(pricing: PricingEntry[]) {
  mockFetchSettings.mockResolvedValue(makeSettings(pricing))
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
  await router.push('/admin/pricing')
  await router.isReady()
  const wrapper = mount(AdminPricingView, {
    global: { plugins: [pinia, router] },
  })
  await flushPromises()
  return wrapper
}

const sampleLlm: PricingEntry = {
  model: 'claude-opus-4-6',
  category: 'llm',
  input_cost_per_mtok: 5.0,
  output_cost_per_mtok: 25.0,
  cost_per_minute: null,
  last_verified: '2026-04-23',
}

const sampleEmbedding: PricingEntry = {
  model: 'text-embedding-3-large',
  category: 'embedding',
  input_cost_per_mtok: 0.13,
  output_cost_per_mtok: 0,
  cost_per_minute: null,
  last_verified: '2026-04-23',
}

const sampleTranscription: PricingEntry = {
  model: 'gpt-4o-transcribe',
  category: 'transcription',
  input_cost_per_mtok: null,
  output_cost_per_mtok: null,
  cost_per_minute: 0.006,
  last_verified: '2026-04-23',
}

describe('AdminPricingView', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  it('renders the heading', async () => {
    const wrapper = await mountView([sampleLlm])
    expect(wrapper.find('[data-testid="admin-pricing-heading"]').text()).toBe(
      'API Pricing',
    )
  })

  it('shows loading state initially', async () => {
    mockFetchSettings.mockReturnValue(new Promise(() => {}))
    mockFetchHealth.mockReturnValue(new Promise(() => {}))
    const router = makeRouter()
    await router.push('/admin/pricing')
    await router.isReady()
    const wrapper = mount(AdminPricingView, {
      global: { plugins: [createPinia(), router] },
    })
    await flushPromises()
    expect(wrapper.find('[data-testid="admin-pricing-loading"]').exists()).toBe(
      true,
    )
  })

  it('shows error state on API failure', async () => {
    mockFetchSettings.mockRejectedValue(new Error('Network error'))
    mockFetchHealth.mockRejectedValue(new Error('Network error'))
    const router = makeRouter()
    await router.push('/admin/pricing')
    await router.isReady()
    const wrapper = mount(AdminPricingView, {
      global: { plugins: [createPinia(), router] },
    })
    await flushPromises()
    expect(wrapper.find('[data-testid="admin-pricing-error"]').exists()).toBe(
      true,
    )
  })

  it('renders pricing rows for all categories', async () => {
    const wrapper = await mountView([
      sampleLlm,
      sampleEmbedding,
      sampleTranscription,
    ])
    const section = wrapper.find('[data-testid="section-api-pricing"]')
    expect(section.text()).toContain('claude-opus-4-6')
    expect(section.text()).toContain('text-embedding-3-large')
    expect(section.text()).toContain('gpt-4o-transcribe')
    expect(section.text()).toContain('$5/MTok in')
    expect(section.text()).toContain('$0.006/min')
  })

  it('shows edit inputs when clicking Edit on an LLM entry', async () => {
    const wrapper = await mountView([sampleLlm])
    await wrapper
      .find('[data-testid="pricing-edit-claude-opus-4-6"]')
      .trigger('click')
    await flushPromises()

    const inputCost = wrapper.find(
      '[data-testid="pricing-input-claude-opus-4-6"]',
    )
    expect(inputCost.exists()).toBe(true)
    expect((inputCost.element as HTMLInputElement).value).toBe('5')
  })

  it('cancel button restores display mode', async () => {
    const wrapper = await mountView([sampleLlm])
    await wrapper
      .find('[data-testid="pricing-edit-claude-opus-4-6"]')
      .trigger('click')
    await flushPromises()
    expect(
      wrapper.find('[data-testid="pricing-input-claude-opus-4-6"]').exists(),
    ).toBe(true)

    await wrapper
      .find('[data-testid="pricing-cancel-claude-opus-4-6"]')
      .trigger('click')
    await flushPromises()
    expect(
      wrapper.find('[data-testid="pricing-input-claude-opus-4-6"]').exists(),
    ).toBe(false)
  })

  it('save button calls updatePricing with parsed costs and exits edit mode', async () => {
    mockUpdatePricing.mockResolvedValue({
      updated: ['claude-opus-4-6'],
      pricing: [{ ...sampleLlm, input_cost_per_mtok: 6.0 }],
    })
    const wrapper = await mountView([sampleLlm])
    await wrapper
      .find('[data-testid="pricing-edit-claude-opus-4-6"]')
      .trigger('click')
    await flushPromises()

    await wrapper
      .find('[data-testid="pricing-input-claude-opus-4-6"]')
      .setValue('6.0')
    await wrapper
      .find('[data-testid="pricing-output-claude-opus-4-6"]')
      .setValue('30.0')
    await wrapper
      .find('[data-testid="pricing-save-claude-opus-4-6"]')
      .trigger('click')
    await flushPromises()

    expect(mockUpdatePricing).toHaveBeenCalledTimes(1)
    const call = mockUpdatePricing.mock.calls[0][0]
    expect(call['claude-opus-4-6'].input_cost_per_mtok).toBe(6.0)
    expect(call['claude-opus-4-6'].output_cost_per_mtok).toBe(30.0)
    expect(call['claude-opus-4-6'].last_verified).toMatch(/^\d{4}-\d{2}-\d{2}$/)

    expect(
      wrapper.find('[data-testid="pricing-input-claude-opus-4-6"]').exists(),
    ).toBe(false)
  })

  it('save sends cost_per_minute for transcription entries', async () => {
    mockUpdatePricing.mockResolvedValue({
      updated: ['gpt-4o-transcribe'],
      pricing: [{ ...sampleTranscription, cost_per_minute: 0.008 }],
    })
    const wrapper = await mountView([sampleTranscription])
    await wrapper
      .find('[data-testid="pricing-edit-gpt-4o-transcribe"]')
      .trigger('click')
    await flushPromises()

    await wrapper
      .find('[data-testid="pricing-minute-gpt-4o-transcribe"]')
      .setValue('0.008')
    await wrapper
      .find('[data-testid="pricing-save-gpt-4o-transcribe"]')
      .trigger('click')
    await flushPromises()

    const call = mockUpdatePricing.mock.calls[0][0]
    expect(call['gpt-4o-transcribe'].cost_per_minute).toBe(0.008)
    expect(call['gpt-4o-transcribe'].input_cost_per_mtok).toBeUndefined()
  })

  it('save failure keeps the editor open', async () => {
    mockUpdatePricing.mockRejectedValue(new Error('boom'))
    const wrapper = await mountView([sampleLlm])
    await wrapper
      .find('[data-testid="pricing-edit-claude-opus-4-6"]')
      .trigger('click')
    await flushPromises()

    await wrapper
      .find('[data-testid="pricing-input-claude-opus-4-6"]')
      .setValue('6.0')
    await wrapper
      .find('[data-testid="pricing-output-claude-opus-4-6"]')
      .setValue('30.0')
    await wrapper
      .find('[data-testid="pricing-save-claude-opus-4-6"]')
      .trigger('click')
    await flushPromises()

    expect(
      wrapper.find('[data-testid="pricing-input-claude-opus-4-6"]').exists(),
    ).toBe(true)
  })

  it('preserves pricing list when API returns 207 partial-success body', async () => {
    // The API client surfaces a 207 as a normal resolved promise with the
    // updated pricing array (and possibly errors). The view simply uses the
    // returned list — partial errors are surfaced via the API layer.
    mockUpdatePricing.mockResolvedValue({
      updated: ['claude-opus-4-6'],
      pricing: [{ ...sampleLlm, input_cost_per_mtok: 6.0 }],
      errors: ['some other model failed'],
    })
    const wrapper = await mountView([sampleLlm])
    await wrapper
      .find('[data-testid="pricing-edit-claude-opus-4-6"]')
      .trigger('click')
    await flushPromises()

    await wrapper
      .find('[data-testid="pricing-input-claude-opus-4-6"]')
      .setValue('6.0')
    await wrapper
      .find('[data-testid="pricing-output-claude-opus-4-6"]')
      .setValue('30.0')
    await wrapper
      .find('[data-testid="pricing-save-claude-opus-4-6"]')
      .trigger('click')
    await flushPromises()

    expect(mockUpdatePricing).toHaveBeenCalled()
    expect(
      wrapper.find('[data-testid="pricing-input-claude-opus-4-6"]').exists(),
    ).toBe(false)
  })
})
