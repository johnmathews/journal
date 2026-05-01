import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createRouter, createMemoryHistory } from 'vue-router'
import SettingsView from '../SettingsView.vue'
import { useAuthStore } from '@/stores/auth'
import type { ServerSettings } from '@/types/settings'

const mockFetchSettings = vi.fn()
const mockFetchHealth = vi.fn()
const mockTriggerEntityExtraction = vi.fn()

vi.mock('@/api/settings', () => ({
  fetchSettings: (...args: unknown[]) => mockFetchSettings(...args),
  fetchHealth: (...args: unknown[]) => mockFetchHealth(...args),
  updateRuntimeSettings: vi.fn(),
  updatePricing: vi.fn(),
}))

vi.mock('@/api/entities', () => ({
  triggerEntityExtraction: (...args: unknown[]) =>
    mockTriggerEntityExtraction(...args),
}))

vi.mock('@/api/jobs', () => ({
  triggerMoodBackfill: vi.fn(),
  getJob: vi.fn(),
  listJobs: vi.fn().mockResolvedValue({ jobs: [], total: 0 }),
}))

vi.mock('@/api/notifications', () => ({
  fetchNotificationTopics: vi.fn().mockResolvedValue({ topics: [] }),
  fetchNotificationStatus: vi.fn().mockResolvedValue({ configured: false }),
  validatePushoverCredentials: vi.fn(),
  sendPushoverTest: vi.fn(),
}))

vi.mock('@/api/preferences', () => ({
  updatePreferences: vi.fn(),
  fetchPreferences: vi.fn().mockResolvedValue({ preferences: {} }),
}))

vi.mock('@/api/dashboard', () => ({
  fetchWritingStats: vi.fn().mockResolvedValue({ bins: [] }),
  fetchMoodDimensions: vi.fn().mockResolvedValue({ dimensions: [] }),
  fetchMoodTrends: vi.fn().mockResolvedValue({ bins: [] }),
  fetchCalendarHeatmap: vi.fn().mockResolvedValue({ days: [] }),
  fetchEntityTrends: vi.fn().mockResolvedValue({ entities: [], bins: [] }),
  fetchMoodEntityCorrelation: vi
    .fn()
    .mockResolvedValue({ items: [], overall_avg: 0 }),
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
    routes: [{ path: '/settings', name: 'settings', component: SettingsView }],
  })
}

describe('SettingsView', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

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
    await router.push('/settings')
    await router.isReady()
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
      'Settings',
    )
  })

  // --- Profile section ---

  it('renders the profile section with email and display name', async () => {
    const wrapper = await mountView()
    expect(wrapper.find('[data-testid="profile-section"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="profile-email"]').text()).toBe(
      'john@example.com',
    )
    expect(wrapper.find('[data-testid="display-name-value"]').text()).toBe(
      'John Mathews',
    )
  })

  it('clicking Edit shows input with current name', async () => {
    const wrapper = await mountView()
    await wrapper.find('[data-testid="display-name-edit-btn"]').trigger('click')
    const input = wrapper.find('[data-testid="display-name-input"]')
    expect(input.exists()).toBe(true)
    expect((input.element as HTMLInputElement).value).toBe('John Mathews')
  })

  it('clicking Cancel hides the input', async () => {
    const wrapper = await mountView()
    await wrapper.find('[data-testid="display-name-edit-btn"]').trigger('click')
    await wrapper
      .find('[data-testid="display-name-cancel-btn"]')
      .trigger('click')
    expect(wrapper.find('[data-testid="display-name-input"]').exists()).toBe(
      false,
    )
  })

  it('saving unchanged name closes editor without API call', async () => {
    const wrapper = await mountView()
    await wrapper.find('[data-testid="display-name-edit-btn"]').trigger('click')
    await wrapper.find('[data-testid="display-name-save-btn"]').trigger('click')
    await flushPromises()
    expect(mockApiFetch).not.toHaveBeenCalledWith(
      '/api/auth/me',
      expect.anything(),
    )
    expect(wrapper.find('[data-testid="display-name-input"]').exists()).toBe(
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
    await wrapper.find('[data-testid="display-name-edit-btn"]').trigger('click')
    await wrapper
      .find('[data-testid="display-name-input"]')
      .setValue('Johnny M')
    await wrapper.find('[data-testid="display-name-save-btn"]').trigger('click')
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
    await wrapper.find('[data-testid="display-name-edit-btn"]').trigger('click')
    await wrapper
      .find('[data-testid="display-name-input"]')
      .setValue('New Name')
    await wrapper.find('[data-testid="display-name-save-btn"]').trigger('click')
    await flushPromises()

    expect(wrapper.find('[data-testid="display-name-error"]').text()).toBe(
      'Failed to update name',
    )
  })

  it('shows error for empty name', async () => {
    const wrapper = await mountView()
    await wrapper.find('[data-testid="display-name-edit-btn"]').trigger('click')
    await wrapper.find('[data-testid="display-name-input"]').setValue('  ')
    await wrapper.find('[data-testid="display-name-save-btn"]').trigger('click')
    await flushPromises()

    expect(wrapper.find('[data-testid="display-name-error"]').text()).toBe(
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
    await wrapper.find('[data-testid="display-name-edit-btn"]').trigger('click')
    await wrapper.find('[data-testid="display-name-input"]').setValue('New')
    await wrapper.find('[data-testid="display-name-save-btn"]').trigger('click')
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
    await wrapper.find('[data-testid="display-name-edit-btn"]').trigger('click')
    await wrapper.find('[data-testid="display-name-input"]').setValue('New')
    await wrapper.find('[data-testid="display-name-save-btn"]').trigger('click')
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

  // --- Maintenance section ---

  it('renders the maintenance section', async () => {
    const wrapper = await mountView()
    expect(wrapper.find('[data-testid="maintenance-section"]').exists()).toBe(
      true,
    )
    expect(wrapper.find('[data-testid="job-mood-backfill"]').exists()).toBe(
      true,
    )
    expect(wrapper.find('[data-testid="job-entity-extraction"]').exists()).toBe(
      true,
    )
  })

  it('mood backfill Run button is enabled when mood scoring is on', async () => {
    const wrapper = await mountView(
      makeSettings({
        features: {
          mood_scoring: true,
          mood_scorer_model: 'claude-sonnet-4-5',
          journal_author_name: 'John',
        },
      }),
    )
    const btn = wrapper.find('[data-testid="run-mood-backfill-button"]')
    expect((btn.element as HTMLButtonElement).disabled).toBe(false)
  })

  it('mood backfill Run button is disabled when mood scoring is off', async () => {
    const wrapper = await mountView(
      makeSettings({
        features: {
          mood_scoring: false,
          mood_scorer_model: 'claude-sonnet-4-5',
          journal_author_name: 'John',
        },
      }),
    )
    const btn = wrapper.find('[data-testid="run-mood-backfill-button"]')
    expect((btn.element as HTMLButtonElement).disabled).toBe(true)
  })

  it('clicking mood backfill Run opens the batch modal', async () => {
    const wrapper = await mountView()
    await wrapper
      .find('[data-testid="run-mood-backfill-button"]')
      .trigger('click')
    await flushPromises()
    expect(
      document.body.querySelector('[data-testid="batch-modal-configure"]'),
    ).not.toBeNull()
    document.body.innerHTML = ''
  })

  it('clicking entity extraction Run opens the batch modal', async () => {
    const wrapper = await mountView()
    await wrapper
      .find('[data-testid="run-entity-extraction-button"]')
      .trigger('click')
    await flushPromises()
    expect(
      document.body.querySelector('[data-testid="batch-modal-configure"]'),
    ).not.toBeNull()
    document.body.innerHTML = ''
  })

  // --- Removed sections (now in /admin/*) ---

  it('does not render the runtime settings section', async () => {
    const wrapper = await mountView(
      makeSettings({
        runtime: [
          {
            key: 'ocr_dual_pass',
            type: 'bool',
            label: 'Dual-Pass OCR',
            description: 'Run both providers.',
            value: false,
          },
        ],
      }),
    )
    expect(
      wrapper.find('[data-testid="runtime-settings-section"]').exists(),
    ).toBe(false)
  })

  it('does not render the pipeline / health / pricing sections', async () => {
    const wrapper = await mountView()
    expect(wrapper.find('[data-testid="health-section"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="settings-section"]').exists()).toBe(
      false,
    )
    expect(wrapper.find('[data-testid="section-api-pricing"]').exists()).toBe(
      false,
    )
    expect(wrapper.find('[data-testid="section-total-cost"]').exists()).toBe(
      false,
    )
  })
})
