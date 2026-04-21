import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createRouter, createMemoryHistory } from 'vue-router'
import SettingsView from '../SettingsView.vue'
import { useAuthStore } from '@/stores/auth'
import type { HealthResponse, ServerSettings } from '@/types/settings'

const mockFetchSettings = vi.fn()
const mockFetchHealth = vi.fn()
const mockTriggerEntityExtraction = vi.fn()

vi.mock('@/api/settings', () => ({
  fetchSettings: (...args: unknown[]) => mockFetchSettings(...args),
  fetchHealth: (...args: unknown[]) => mockFetchHealth(...args),
}))

vi.mock('@/api/entities', () => ({
  triggerEntityExtraction: (...args: unknown[]) =>
    mockTriggerEntityExtraction(...args),
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

import { apiFetch } from '@/api/client'
const mockApiFetch = vi.mocked(apiFetch)

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
    const pinia = createPinia()
    const router = makeRouter()
    await router.push('/settings')
    await router.isReady()
    // Pre-populate the auth store with a user
    setActivePinia(pinia)
    const authStore = useAuthStore()
    authStore.user = {
      id: 1,
      email: 'john@example.com',
      display_name: 'John Mathews',
      is_admin: false,
      is_active: true,
      email_verified: true,
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
    }
    const wrapper = mount(SettingsView, {
      global: { plugins: [pinia, router] },
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

  it('displays OCR provider and model in ingestion section', async () => {
    const wrapper = await mountView()
    expect(wrapper.find('[data-testid="ocr-provider"]').text()).toBe('gemini')
    expect(wrapper.find('[data-testid="ocr-model"]').text()).toBe(
      'gemini-3-pro',
    )
  })

  it('displays pipeline sections with settings', async () => {
    const wrapper = await mountView()
    const section = wrapper.find('[data-testid="settings-section"]')
    expect(section.exists()).toBe(true)
    // Ingestion section
    expect(wrapper.find('[data-testid="section-ingestion"]').exists()).toBe(
      true,
    )
    // Chunking section
    const chunking = wrapper.find('[data-testid="section-chunking"]')
    expect(chunking.exists()).toBe(true)
    expect(chunking.text()).toContain('semantic')
    expect(chunking.text()).toContain('150')
    expect(chunking.text()).toContain('text-embedding-3-large')
    expect(chunking.text()).toContain('1024')
    // Mood section
    expect(wrapper.find('[data-testid="section-mood"]').exists()).toBe(true)
    // Entity section
    const entity = wrapper.find('[data-testid="section-entity"]')
    expect(entity.exists()).toBe(true)
    expect(entity.text()).toContain('claude-opus-4-6')
    expect(entity.text()).toContain('0.88')
  })

  it('displays cost badges', async () => {
    const wrapper = await mountView()
    expect(wrapper.find('[data-testid="ingestion-cost"]').text()).toContain(
      '/page',
    )
    expect(wrapper.find('[data-testid="chunking-cost"]').text()).toContain(
      '/entry',
    )
    expect(wrapper.find('[data-testid="mood-cost"]').text()).toContain('/entry')
    expect(wrapper.find('[data-testid="entity-cost"]').text()).toContain(
      '/entry',
    )
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

  // --- Author name editing ---

  it('displays author name from auth store, not server settings', async () => {
    const wrapper = await mountView()
    expect(wrapper.find('[data-testid="author-name-value"]').text()).toBe(
      'John Mathews',
    )
  })

  it('shows edit button for author name', async () => {
    const wrapper = await mountView()
    expect(wrapper.find('[data-testid="author-name-edit-btn"]').exists()).toBe(
      true,
    )
  })

  it('clicking Edit shows input with current name', async () => {
    const wrapper = await mountView()
    await wrapper.find('[data-testid="author-name-edit-btn"]').trigger('click')
    const input = wrapper.find('[data-testid="author-name-input"]')
    expect(input.exists()).toBe(true)
    expect((input.element as HTMLInputElement).value).toBe('John Mathews')
  })

  it('clicking Cancel hides the input', async () => {
    const wrapper = await mountView()
    await wrapper.find('[data-testid="author-name-edit-btn"]').trigger('click')
    expect(wrapper.find('[data-testid="author-name-input"]').exists()).toBe(
      true,
    )
    await wrapper
      .find('[data-testid="author-name-cancel-btn"]')
      .trigger('click')
    expect(wrapper.find('[data-testid="author-name-input"]').exists()).toBe(
      false,
    )
  })

  it('saving unchanged name closes editor without API call', async () => {
    const wrapper = await mountView()
    await wrapper.find('[data-testid="author-name-edit-btn"]').trigger('click')
    await wrapper.find('[data-testid="author-name-save-btn"]').trigger('click')
    await flushPromises()
    expect(mockApiFetch).not.toHaveBeenCalledWith(
      '/api/auth/me',
      expect.anything(),
    )
    expect(wrapper.find('[data-testid="author-name-input"]').exists()).toBe(
      false,
    )
  })

  it('saving new name calls updateDisplayName and shows re-extract prompt', async () => {
    mockApiFetch.mockResolvedValueOnce({
      user: {
        id: 1,
        email: 'john@example.com',
        display_name: 'Johnny M',
        is_admin: false,
        is_active: true,
        email_verified: true,
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T00:00:00Z',
      },
    })
    const wrapper = await mountView()
    await wrapper.find('[data-testid="author-name-edit-btn"]').trigger('click')
    await wrapper.find('[data-testid="author-name-input"]').setValue('Johnny M')
    await wrapper.find('[data-testid="author-name-save-btn"]').trigger('click')
    await flushPromises()

    expect(mockApiFetch).toHaveBeenCalledWith('/api/auth/me', {
      method: 'PATCH',
      body: JSON.stringify({ display_name: 'Johnny M' }),
    })
    expect(wrapper.find('[data-testid="reextract-prompt"]').exists()).toBe(true)
  })

  it('shows error when saving name fails', async () => {
    mockApiFetch.mockRejectedValueOnce(new Error('Server error'))
    const wrapper = await mountView()
    await wrapper.find('[data-testid="author-name-edit-btn"]').trigger('click')
    await wrapper.find('[data-testid="author-name-input"]').setValue('New Name')
    await wrapper.find('[data-testid="author-name-save-btn"]').trigger('click')
    await flushPromises()

    expect(wrapper.find('[data-testid="author-name-error"]').text()).toBe(
      'Failed to update name',
    )
  })

  it('shows error for empty name', async () => {
    const wrapper = await mountView()
    await wrapper.find('[data-testid="author-name-edit-btn"]').trigger('click')
    await wrapper.find('[data-testid="author-name-input"]').setValue('  ')
    await wrapper.find('[data-testid="author-name-save-btn"]').trigger('click')
    await flushPromises()

    expect(wrapper.find('[data-testid="author-name-error"]').text()).toBe(
      'Name cannot be empty',
    )
  })

  it('dismiss button hides re-extract prompt', async () => {
    mockApiFetch.mockResolvedValueOnce({
      user: {
        id: 1,
        email: 'john@example.com',
        display_name: 'New',
        is_admin: false,
        is_active: true,
        email_verified: true,
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T00:00:00Z',
      },
    })
    const wrapper = await mountView()
    await wrapper.find('[data-testid="author-name-edit-btn"]').trigger('click')
    await wrapper.find('[data-testid="author-name-input"]').setValue('New')
    await wrapper.find('[data-testid="author-name-save-btn"]').trigger('click')
    await flushPromises()

    await wrapper.find('[data-testid="reextract-dismiss-btn"]').trigger('click')
    expect(wrapper.find('[data-testid="reextract-prompt"]').exists()).toBe(
      false,
    )
  })

  it('confirm re-extract triggers entity extraction', async () => {
    mockApiFetch.mockResolvedValueOnce({
      user: {
        id: 1,
        email: 'john@example.com',
        display_name: 'New',
        is_admin: false,
        is_active: true,
        email_verified: true,
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T00:00:00Z',
      },
    })
    mockTriggerEntityExtraction.mockResolvedValueOnce({
      job_id: 'job-123',
      status: 'queued',
    })
    const wrapper = await mountView()
    await wrapper.find('[data-testid="author-name-edit-btn"]').trigger('click')
    await wrapper.find('[data-testid="author-name-input"]').setValue('New')
    await wrapper.find('[data-testid="author-name-save-btn"]').trigger('click')
    await flushPromises()

    await wrapper.find('[data-testid="reextract-confirm-btn"]').trigger('click')
    await flushPromises()

    expect(mockTriggerEntityExtraction).toHaveBeenCalledWith({
      stale_only: false,
    })
    expect(wrapper.find('[data-testid="reextract-prompt"]').exists()).toBe(
      false,
    )
  })
})
