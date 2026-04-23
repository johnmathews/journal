import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import AppNotifications from '../AppNotifications.vue'
import { useJobsStore } from '@/stores/jobs'
import { useToast } from '@/composables/useToast'
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

// Shared module-level toasts ref — same instance AppNotifications uses.
const toast = useToast()

describe('AppNotifications', () => {
  let pinia: ReturnType<typeof createPinia>

  beforeEach(() => {
    vi.useFakeTimers()
    pinia = createPinia()
    setActivePinia(pinia)
    // Clear module-level toasts from prior tests
    toast.toasts.value = []
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
    ['ingest_audio', 'Audio ingestion'],
    ['mood_score_entry', 'Mood scoring'],
    ['reprocess_embeddings', 'Re-embedding'],
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

  // --- Grouped notifications ---
  // useToast() shares a module-level toasts ref across all callers,
  // so we read that ref to verify which toasts were shown.

  function toastMessages() {
    return toast.toasts.value.map((t) => ({ message: t.message, type: t.type }))
  }

  it('shows one summary toast when all grouped jobs succeed', async () => {
    const store = useJobsStore()
    store.createGroup('g1', 'Entry created — all processing complete')
    store.trackJob('j1', 'ingest_audio', {}, 'g1')
    store.trackJob('j2', 'mood_score_entry', {}, 'g1')
    store.trackJob('j3', 'entity_extraction', {}, 'g1')
    // Set all to running
    store.jobs['j1'] = makeJob({
      id: 'j1',
      type: 'ingest_audio',
      status: 'running',
    })
    store.jobs['j2'] = makeJob({
      id: 'j2',
      type: 'mood_score_entry',
      status: 'running',
    })
    store.jobs['j3'] = makeJob({
      id: 'j3',
      type: 'entity_extraction',
      status: 'running',
    })

    const wrapper = mount(AppNotifications, { global: { plugins: [pinia] } })

    // Job 1 succeeds — group not complete, no toast
    store.jobs['j1'] = makeJob({
      id: 'j1',
      type: 'ingest_audio',
      status: 'succeeded',
    })
    vi.advanceTimersByTime(600)
    await flushPromises()
    expect(toastMessages().filter((t) => t.type === 'success')).toHaveLength(0)

    // Job 2 succeeds — still not complete
    store.jobs['j2'] = makeJob({
      id: 'j2',
      type: 'mood_score_entry',
      status: 'succeeded',
    })
    vi.advanceTimersByTime(600)
    await flushPromises()
    expect(toastMessages().filter((t) => t.type === 'success')).toHaveLength(0)

    // Job 3 succeeds — group complete, ONE summary toast
    store.jobs['j3'] = makeJob({
      id: 'j3',
      type: 'entity_extraction',
      status: 'succeeded',
    })
    vi.advanceTimersByTime(600)
    await flushPromises()
    const successes = toastMessages().filter((t) => t.type === 'success')
    expect(successes).toHaveLength(1)
    expect(successes[0].message).toBe('Entry created — all processing complete')

    wrapper.unmount()
  })

  it('shows individual error toast immediately for grouped failed job', async () => {
    const store = useJobsStore()
    store.createGroup('g1', 'Entry created — all processing complete')
    store.trackJob('j1', 'ingest_audio', {}, 'g1')
    store.trackJob('j2', 'mood_score_entry', {}, 'g1')
    store.jobs['j1'] = makeJob({
      id: 'j1',
      type: 'ingest_audio',
      status: 'running',
    })
    store.jobs['j2'] = makeJob({
      id: 'j2',
      type: 'mood_score_entry',
      status: 'running',
    })

    const wrapper = mount(AppNotifications, { global: { plugins: [pinia] } })

    // Job 1 fails — error toast fires immediately
    store.jobs['j1'] = makeJob({
      id: 'j1',
      type: 'ingest_audio',
      status: 'failed',
      error_message: 'API error',
    })
    vi.advanceTimersByTime(600)
    await flushPromises()
    const errors = toastMessages().filter((t) => t.type === 'error')
    expect(errors).toHaveLength(1)
    expect(errors[0].message).toBe('Audio ingestion failed: API error')
    // No success toast (group not complete)
    expect(toastMessages().filter((t) => t.type === 'success')).toHaveLength(0)

    // Job 2 succeeds — group complete but has failure, NO summary toast
    store.jobs['j2'] = makeJob({
      id: 'j2',
      type: 'mood_score_entry',
      status: 'succeeded',
    })
    vi.advanceTimersByTime(600)
    await flushPromises()
    expect(toastMessages().filter((t) => t.type === 'success')).toHaveLength(0)

    wrapper.unmount()
  })

  it('ungrouped failed job shows individual error toast', async () => {
    const store = useJobsStore()
    const wrapper = mountWith(
      makeJob({ id: 'j1', type: 'reprocess_embeddings', status: 'running' }),
    )

    store.jobs['j1'] = makeJob({
      id: 'j1',
      type: 'reprocess_embeddings',
      status: 'failed',
      error_message: 'timeout',
    })
    vi.advanceTimersByTime(600)
    await flushPromises()
    const errors = toastMessages().filter((t) => t.type === 'error')
    expect(errors).toHaveLength(1)
    expect(errors[0].message).toBe('Re-embedding failed: timeout')

    wrapper.unmount()
  })

  it('ungrouped jobs still show individual toasts', async () => {
    const store = useJobsStore()
    const wrapper = mountWith(
      makeJob({ id: 'j1', type: 'entity_extraction', status: 'running' }),
    )

    store.jobs['j1'] = makeJob({
      id: 'j1',
      type: 'entity_extraction',
      status: 'succeeded',
    })
    vi.advanceTimersByTime(600)
    await flushPromises()
    const successes = toastMessages().filter((t) => t.type === 'success')
    expect(successes).toHaveLength(1)
    expect(successes[0].message).toBe(
      'Entity extraction completed successfully',
    )

    wrapper.unmount()
  })
})
