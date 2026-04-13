import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import AppNotifications from '../AppNotifications.vue'
import { useJobsStore } from '@/stores/jobs'

vi.mock('@/api/entities', () => ({
  triggerEntityExtraction: vi.fn(),
}))

vi.mock('@/api/jobs', () => ({
  triggerMoodBackfill: vi.fn(),
  getJob: vi.fn(),
}))

describe('AppNotifications', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  function mountComponent() {
    return mount(AppNotifications, {
      global: { plugins: [createPinia()] },
    })
  }

  it('renders the bell button', () => {
    const wrapper = mountComponent()
    expect(wrapper.find('[data-testid="notifications-bell"]').exists()).toBe(
      true,
    )
  })

  it('does not show badge when no active jobs', () => {
    const wrapper = mountComponent()
    expect(wrapper.find('[data-testid="notifications-badge"]').exists()).toBe(
      false,
    )
  })

  it('shows badge count for active jobs', async () => {
    const pinia = createPinia()
    setActivePinia(pinia)
    const store = useJobsStore()

    // Manually inject a running job
    store.jobs['job-1'] = {
      id: 'job-1',
      type: 'entity_extraction',
      status: 'running',
      params: {},
      progress_current: 0,
      progress_total: 0,
      result: null,
      error_message: null,
      created_at: new Date().toISOString(),
      started_at: null,
      finished_at: null,
    }

    const wrapper = mount(AppNotifications, {
      global: { plugins: [pinia] },
    })
    await flushPromises()

    const badge = wrapper.find('[data-testid="notifications-badge"]')
    expect(badge.exists()).toBe(true)
    expect(badge.text()).toBe('1')
  })

  it('toggles dropdown on click', async () => {
    const wrapper = mountComponent()

    expect(
      wrapper.find('[data-testid="notifications-dropdown"]').exists(),
    ).toBe(false)

    await wrapper.find('[data-testid="notifications-bell"]').trigger('click')

    expect(
      wrapper.find('[data-testid="notifications-dropdown"]').exists(),
    ).toBe(true)
  })

  it('shows "No recent jobs" when dropdown is empty', async () => {
    const wrapper = mountComponent()
    await wrapper.find('[data-testid="notifications-bell"]').trigger('click')
    expect(wrapper.text()).toContain('No recent jobs')
  })

  it('shows job entries in the dropdown', async () => {
    const pinia = createPinia()
    setActivePinia(pinia)
    const store = useJobsStore()

    store.jobs['job-1'] = {
      id: 'job-1',
      type: 'mood_backfill',
      status: 'running',
      params: {},
      progress_current: 3,
      progress_total: 10,
      result: null,
      error_message: null,
      created_at: new Date().toISOString(),
      started_at: new Date().toISOString(),
      finished_at: null,
    }

    const wrapper = mount(AppNotifications, {
      global: { plugins: [pinia] },
    })
    await wrapper.find('[data-testid="notifications-bell"]').trigger('click')

    expect(wrapper.text()).toContain('Mood backfill')
    expect(wrapper.text()).toContain('3/10')
  })
})
