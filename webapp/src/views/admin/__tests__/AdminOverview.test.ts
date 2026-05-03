import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createRouter, createMemoryHistory } from 'vue-router'
import AdminOverview from '../AdminOverview.vue'
import type { HealthResponse, ServerSettings } from '@/types/settings'

const mockFetchSettings = vi.fn()
const mockFetchHealth = vi.fn()

vi.mock('@/api/settings', () => ({
  fetchSettings: (...args: unknown[]) => mockFetchSettings(...args),
  fetchHealth: (...args: unknown[]) => mockFetchHealth(...args),
  updateRuntimeSettings: vi.fn(),
  updatePricing: vi.fn(),
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

function makeHealth(overrides: Partial<HealthResponse> = {}): HealthResponse {
  return {
    status: 'ok',
    checks: [
      { name: 'sqlite', status: 'ok', detail: '' },
      { name: 'chromadb', status: 'ok', detail: '' },
    ],
    ingestion: {
      total_entries: 42,
      total_words: 12345,
      total_chunks: 210,
      avg_words_per_entry: 294,
      avg_chunks_per_entry: 5.0,
      last_ingested_at: '2026-04-14T10:00:00Z',
      entries_last_7d: 5,
      entries_last_30d: 18,
      by_source_type: { photo: 40, voice: 2 },
      row_counts: { entries: 42, entry_pages: 42, chunks: 210 },
    },
    queries: {
      total_queries: 100,
      uptime_seconds: 3661,
      started_at: '2026-04-14T09:00:00Z',
      by_type: {},
    },
    ...overrides,
  }
}

function makeRouter() {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/admin', name: 'admin-overview', component: AdminOverview },
      {
        path: '/admin/users',
        name: 'admin-users',
        component: { template: '<div/>' },
      },
      {
        path: '/admin/runtime',
        name: 'admin-runtime',
        component: { template: '<div/>' },
      },
      {
        path: '/admin/pricing',
        name: 'admin-pricing',
        component: { template: '<div/>' },
      },
      {
        path: '/admin/server',
        name: 'admin-server',
        component: { template: '<div/>' },
      },
    ],
  })
}

async function mountView(
  settings: ServerSettings = makeSettings(),
  health: HealthResponse = makeHealth(),
) {
  mockFetchSettings.mockResolvedValue(settings)
  mockFetchHealth.mockResolvedValue(health)
  const pinia = createPinia()
  const router = makeRouter()
  await router.push('/admin')
  await router.isReady()
  const wrapper = mount(AdminOverview, {
    global: { plugins: [pinia, router] },
  })
  await flushPromises()
  return wrapper
}

describe('AdminOverview', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  it('renders health status, uptime, and component checks', async () => {
    const wrapper = await mountView()
    expect(wrapper.find('[data-testid="health-status"]').text()).toBe('ok')
    expect(wrapper.find('[data-testid="health-uptime"]').text()).toBe('1h 1m')
    const checks = wrapper.find('[data-testid="health-checks"]')
    expect(checks.text()).toContain('sqlite')
    expect(checks.text()).toContain('chromadb')
  })

  it('shows degraded health status', async () => {
    const wrapper = await mountView(
      makeSettings(),
      makeHealth({ status: 'degraded' }),
    )
    expect(wrapper.find('[data-testid="health-status"]').text()).toBe(
      'degraded',
    )
  })

  it('renders ingestion stats', async () => {
    const wrapper = await mountView()
    const stats = wrapper.find('[data-testid="ingestion-stats"]')
    expect(stats.text()).toContain('5 entries')
    expect(stats.text()).toContain('18 entries')
  })

  it('renders a cost teaser linking to the pricing tab', async () => {
    const wrapper = await mountView()
    const teaser = wrapper.find('[data-testid="section-cost-teaser"]')
    expect(teaser.exists()).toBe(true)
    expect(
      wrapper.find('[data-testid="cost-teaser-image-total"]').exists(),
    ).toBe(true)
    expect(
      wrapper.find('[data-testid="cost-teaser-audio-total"]').exists(),
    ).toBe(true)
    expect(
      wrapper.find('[data-testid="cost-teaser-link"]').attributes('href'),
    ).toBe('/admin/pricing')
  })

  it('does not render the full cost breakdown on overview', async () => {
    const wrapper = await mountView()
    expect(wrapper.find('[data-testid="section-total-cost"]').exists()).toBe(
      false,
    )
    expect(
      wrapper.find('[data-testid="image-ingestion-subtotal"]').exists(),
    ).toBe(false)
  })

  it('renders quick links to other admin tabs', async () => {
    const wrapper = await mountView()
    const links = wrapper.find('[data-testid="admin-overview-links"]')
    expect(links.exists()).toBe(true)
    expect(
      wrapper.find('[data-testid="link-admin-users"]').attributes('href'),
    ).toBe('/admin/users')
    expect(
      wrapper.find('[data-testid="link-admin-runtime"]').attributes('href'),
    ).toBe('/admin/runtime')
    expect(
      wrapper.find('[data-testid="link-admin-pricing"]').attributes('href'),
    ).toBe('/admin/pricing')
    expect(
      wrapper.find('[data-testid="link-admin-server"]').attributes('href'),
    ).toBe('/admin/server')
  })

  it('shows loading state initially', async () => {
    mockFetchSettings.mockReturnValue(new Promise(() => {}))
    mockFetchHealth.mockReturnValue(new Promise(() => {}))
    const router = makeRouter()
    await router.push('/admin')
    await router.isReady()
    const wrapper = mount(AdminOverview, {
      global: { plugins: [createPinia(), router] },
    })
    await flushPromises()
    expect(
      wrapper.find('[data-testid="admin-overview-loading"]').exists(),
    ).toBe(true)
  })

  it('shows error state on API failure', async () => {
    mockFetchSettings.mockRejectedValue(new Error('Network error'))
    mockFetchHealth.mockRejectedValue(new Error('Network error'))
    const router = makeRouter()
    await router.push('/admin')
    await router.isReady()
    const wrapper = mount(AdminOverview, {
      global: { plugins: [createPinia(), router] },
    })
    await flushPromises()
    expect(wrapper.find('[data-testid="admin-overview-error"]').exists()).toBe(
      true,
    )
  })
})
