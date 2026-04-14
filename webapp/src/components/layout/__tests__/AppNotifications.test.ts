import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import AppNotifications from '../AppNotifications.vue'
import { useJobsStore } from '@/stores/jobs'
import type { Job, JobType } from '@/types/job'

vi.mock('@/api/entities', () => ({
  triggerEntityExtraction: vi.fn(),
}))

vi.mock('@/api/jobs', () => ({
  triggerMoodBackfill: vi.fn(),
  getJob: vi.fn(),
}))

function makeJob(overrides: Partial<Job> & { id: string; type: JobType }): Job {
  return {
    status: 'running',
    params: {},
    progress_current: 0,
    progress_total: 0,
    result: null,
    error_message: null,
    status_detail: null,
    created_at: new Date().toISOString(),
    started_at: null,
    finished_at: null,
    ...overrides,
  }
}

describe('AppNotifications', () => {
  let pinia: ReturnType<typeof createPinia>

  beforeEach(() => {
    vi.useFakeTimers()
    pinia = createPinia()
    setActivePinia(pinia)
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  function mountWith(...jobs: Job[]) {
    const store = useJobsStore()
    for (const j of jobs) {
      store.jobs[j.id] = j
    }
    return mount(AppNotifications, { global: { plugins: [pinia] } })
  }

  // --- Bell & badge ---

  it('renders the bell button', () => {
    const wrapper = mountWith()
    expect(wrapper.find('[data-testid="notifications-bell"]').exists()).toBe(
      true,
    )
  })

  it('does not show badge when no active jobs', () => {
    const wrapper = mountWith()
    expect(wrapper.find('[data-testid="notifications-badge"]').exists()).toBe(
      false,
    )
  })

  it('shows badge count for active jobs', async () => {
    const wrapper = mountWith(
      makeJob({ id: 'j1', type: 'entity_extraction', status: 'running' }),
      makeJob({ id: 'j2', type: 'mood_backfill', status: 'queued' }),
    )
    await flushPromises()
    const badge = wrapper.find('[data-testid="notifications-badge"]')
    expect(badge.exists()).toBe(true)
    expect(badge.text()).toBe('2')
  })

  it('does not count terminal jobs in badge', async () => {
    const wrapper = mountWith(
      makeJob({ id: 'j1', type: 'entity_extraction', status: 'succeeded' }),
    )
    await flushPromises()
    expect(wrapper.find('[data-testid="notifications-badge"]').exists()).toBe(
      false,
    )
  })

  // --- Dropdown toggle ---

  it('toggles dropdown on click', async () => {
    const wrapper = mountWith()
    expect(
      wrapper.find('[data-testid="notifications-dropdown"]').exists(),
    ).toBe(false)
    await wrapper.find('[data-testid="notifications-bell"]').trigger('click')
    expect(
      wrapper.find('[data-testid="notifications-dropdown"]').exists(),
    ).toBe(true)
  })

  it('shows "No recent jobs" when dropdown is empty', async () => {
    const wrapper = mountWith()
    await wrapper.find('[data-testid="notifications-bell"]').trigger('click')
    expect(wrapper.text()).toContain('No recent jobs')
  })

  it('closes dropdown via click-outside overlay', async () => {
    const wrapper = mountWith()
    await wrapper.find('[data-testid="notifications-bell"]').trigger('click')
    expect(
      wrapper.find('[data-testid="notifications-dropdown"]').exists(),
    ).toBe(true)
    // The fixed overlay is rendered when open
    await wrapper.find('.fixed.inset-0').trigger('click')
    expect(
      wrapper.find('[data-testid="notifications-dropdown"]').exists(),
    ).toBe(false)
  })

  // --- Job labels ---

  it.each([
    ['entity_extraction', 'Entity extraction'],
    ['mood_backfill', 'Mood backfill'],
    ['ingest_images', 'Image ingestion'],
    ['mood_score_entry', 'Mood scoring'],
  ] as [JobType, string][])(
    'shows correct label for %s',
    async (type, expected) => {
      const wrapper = mountWith(makeJob({ id: 'j1', type }))
      await wrapper.find('[data-testid="notifications-bell"]').trigger('click')
      expect(wrapper.text()).toContain(expected)
    },
  )

  // --- Status display ---

  it('shows progress for running job with total', async () => {
    const wrapper = mountWith(
      makeJob({
        id: 'j1',
        type: 'mood_backfill',
        status: 'running',
        progress_current: 3,
        progress_total: 10,
      }),
    )
    await wrapper.find('[data-testid="notifications-bell"]').trigger('click')
    expect(wrapper.text()).toContain('3/10')
  })

  it('shows raw progress_total for ingest_images jobs (no off-by-one)', async () => {
    const wrapper = mountWith(
      makeJob({
        id: 'j1',
        type: 'ingest_images',
        status: 'running',
        progress_current: 2,
        progress_total: 3,
      }),
    )
    await wrapper.find('[data-testid="notifications-bell"]').trigger('click')
    // Should show 2/3 — not 2/4 (old bug: server sent total+1)
    expect(wrapper.text()).toContain('2/3')
  })

  it('shows error message for failed job', async () => {
    const wrapper = mountWith(
      makeJob({
        id: 'j1',
        type: 'entity_extraction',
        status: 'failed',
        error_message: 'API key expired',
      }),
    )
    await wrapper.find('[data-testid="notifications-bell"]').trigger('click')
    expect(wrapper.text()).toContain('API key expired')
  })

  it('shows capitalized status for queued job', async () => {
    const wrapper = mountWith(
      makeJob({ id: 'j1', type: 'entity_extraction', status: 'queued' }),
    )
    await wrapper.find('[data-testid="notifications-bell"]').trigger('click')
    expect(wrapper.text()).toContain('queued')
  })

  it('shows dismiss button only for terminal jobs', async () => {
    const wrapper = mountWith(
      makeJob({ id: 'j1', type: 'entity_extraction', status: 'running' }),
      makeJob({ id: 'j2', type: 'mood_backfill', status: 'succeeded' }),
    )
    await wrapper.find('[data-testid="notifications-bell"]').trigger('click')
    // Only the succeeded job should have a dismiss button
    const dismissButtons = wrapper.findAll('button[aria-label="Dismiss"]')
    expect(dismissButtons).toHaveLength(1)
  })

  it('dismiss removes the job from the store', async () => {
    const store = useJobsStore()
    const wrapper = mountWith(
      makeJob({
        id: 'j1',
        type: 'entity_extraction',
        status: 'succeeded',
      }),
    )
    await wrapper.find('[data-testid="notifications-bell"]').trigger('click')
    await wrapper.find('button[aria-label="Dismiss"]').trigger('click')
    expect(store.jobs['j1']).toBeUndefined()
  })

  // --- Auto-dismiss of completed jobs ---

  it('auto-dismisses completed jobs after 8 seconds', async () => {
    const store = useJobsStore()
    const wrapper = mountWith(
      makeJob({ id: 'j1', type: 'entity_extraction', status: 'running' }),
    )

    // Job transitions to succeeded
    store.jobs['j1'] = makeJob({
      id: 'j1',
      type: 'entity_extraction',
      status: 'succeeded',
    })

    // Advance past the check interval (500ms) to detect the terminal state
    vi.advanceTimersByTime(600)
    await flushPromises()

    // Job still exists (8s hasn't elapsed)
    expect(store.jobs['j1']).toBeDefined()

    // Advance past the 8s auto-dismiss
    vi.advanceTimersByTime(8000)
    await flushPromises()

    expect(store.jobs['j1']).toBeUndefined()
    wrapper.unmount()
  })
})
