import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createRouter, createMemoryHistory } from 'vue-router'
import SettingsView from '../SettingsView.vue'
import type { HealthResponse, ServerSettings } from '@/types/settings'

const mockFetchSettings = vi.fn()
const mockFetchHealth = vi.fn()

vi.mock('@/api/settings', () => ({
  fetchSettings: (...args: unknown[]) => mockFetchSettings(...args),
  fetchHealth: (...args: unknown[]) => mockFetchHealth(...args),
}))

function makeSettings(overrides: Partial<ServerSettings> = {}): ServerSettings {
  return {
    ocr: { provider: 'gemini', model: 'gemini-3-pro' },
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
      mood_scoring: true,
      mood_scorer_model: 'claude-sonnet-4-5',
      journal_author_name: 'John',
    },
    ...overrides,
  }
}

function makeHealth(overrides: Partial<HealthResponse> = {}): HealthResponse {
  return {
    status: 'ok',
    checks: [
      { name: 'sqlite', status: 'ok', detail: '' },
      { name: 'chromadb', status: 'ok', detail: '' },
      { name: 'anthropic', status: 'ok', detail: '' },
      { name: 'openai', status: 'ok', detail: '' },
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
      by_source_type: { ocr: 40, voice: 2 },
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
    routes: [{ path: '/settings', name: 'settings', component: SettingsView }],
  })
}

describe('SettingsView', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  async function mountView(
    settings: ServerSettings = makeSettings(),
    health: HealthResponse = makeHealth(),
  ) {
    mockFetchSettings.mockResolvedValue(settings)
    mockFetchHealth.mockResolvedValue(health)
    const router = makeRouter()
    await router.push('/settings')
    await router.isReady()
    const wrapper = mount(SettingsView, {
      global: { plugins: [createPinia(), router] },
    })
    await flushPromises()
    return wrapper
  }

  it('renders the page heading', async () => {
    const wrapper = await mountView()
    expect(wrapper.find('[data-testid="settings-heading"]').text()).toBe(
      'Settings & Health',
    )
  })

  it('shows loading state initially', async () => {
    mockFetchSettings.mockReturnValue(new Promise(() => {}))
    mockFetchHealth.mockReturnValue(new Promise(() => {}))
    const router = makeRouter()
    await router.push('/settings')
    await router.isReady()
    const wrapper = mount(SettingsView, {
      global: { plugins: [createPinia(), router] },
    })
    // Wait one tick for onMounted to fire and set loading=true
    await flushPromises()
    expect(wrapper.find('[data-testid="settings-loading"]').exists()).toBe(true)
  })

  it('shows error state on API failure', async () => {
    mockFetchSettings.mockRejectedValue(new Error('Network error'))
    mockFetchHealth.mockRejectedValue(new Error('Network error'))
    const router = makeRouter()
    await router.push('/settings')
    await router.isReady()
    const wrapper = mount(SettingsView, {
      global: { plugins: [createPinia(), router] },
    })
    await flushPromises()
    expect(wrapper.find('[data-testid="settings-error"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="settings-error"]').text()).toContain(
      'Network error',
    )
  })

  it('displays health status', async () => {
    const wrapper = await mountView()
    expect(wrapper.find('[data-testid="health-status"]').text()).toBe('ok')
  })

  it('displays degraded health status', async () => {
    const wrapper = await mountView(
      makeSettings(),
      makeHealth({
        status: 'degraded',
        checks: [
          { name: 'sqlite', status: 'ok', detail: '' },
          {
            name: 'chromadb',
            status: 'degraded',
            detail: 'connection timeout',
          },
        ],
      }),
    )
    expect(wrapper.find('[data-testid="health-status"]').text()).toBe(
      'degraded',
    )
  })

  it('displays uptime', async () => {
    const wrapper = await mountView()
    expect(wrapper.find('[data-testid="health-uptime"]').text()).toBe('1h 1m')
  })

  it('displays component checks', async () => {
    const wrapper = await mountView()
    const checks = wrapper.find('[data-testid="health-checks"]')
    expect(checks.exists()).toBe(true)
    expect(checks.text()).toContain('sqlite')
    expect(checks.text()).toContain('chromadb')
  })

  it('displays ingestion stats', async () => {
    const wrapper = await mountView()
    const stats = wrapper.find('[data-testid="ingestion-stats"]')
    expect(stats.exists()).toBe(true)
    expect(stats.text()).toContain('5 entries')
    expect(stats.text()).toContain('18 entries')
  })

  it('displays OCR provider and model', async () => {
    const wrapper = await mountView()
    expect(wrapper.find('[data-testid="ocr-provider"]').text()).toBe('gemini')
    expect(wrapper.find('[data-testid="ocr-model"]').text()).toBe(
      'gemini-3-pro',
    )
  })

  it('displays settings section', async () => {
    const wrapper = await mountView()
    const section = wrapper.find('[data-testid="settings-section"]')
    expect(section.exists()).toBe(true)
    expect(section.text()).toContain('semantic')
    expect(section.text()).toContain('150')
    expect(section.text()).toContain('text-embedding-3-large')
    expect(section.text()).toContain('1024')
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
    expect(wrapper.text()).toContain('claude-sonnet-4-5')
  })

  it('hides mood scorer model when mood scoring is disabled', async () => {
    const wrapper = await mountView(
      makeSettings({
        features: {
          mood_scoring: false,
          mood_scorer_model: 'claude-sonnet-4-5',
          journal_author_name: 'John',
        },
      }),
    )
    expect(wrapper.text()).not.toContain('claude-sonnet-4-5')
  })
})
