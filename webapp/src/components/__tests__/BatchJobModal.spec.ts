import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { nextTick } from 'vue'
import BatchJobModal from '../BatchJobModal.vue'
import { useJobsStore } from '@/stores/jobs'
import type { Job } from '@/types/job'

/**
 * BatchJobModal — tests drive the small configure → running →
 * done | error state machine directly, mocking the store actions
 * so we can control the returned job id and mutate the store's
 * reactive job map to simulate polling transitions.
 *
 * The underlying BaseModal teleports to document.body, so we
 * scrub the body between tests to keep mounted panels from
 * leaking across cases.
 */

function cleanupBody(): void {
  document.body.innerHTML = ''
  document.body.style.overflow = ''
}

function makeJob(overrides: Partial<Job> = {}): Job {
  return {
    id: 'job-1',
    type: 'entity_extraction',
    status: 'running',
    params: {},
    progress_current: 0,
    progress_total: 0,
    result: null,
    error_message: null,
    created_at: '2026-04-11T10:00:00Z',
    started_at: null,
    finished_at: null,
    ...overrides,
  }
}

function mountModal(props: {
  modelValue: boolean
  title: string
  jobKind: 'entity_extraction' | 'mood_backfill'
}) {
  return mount(BatchJobModal, {
    props,
    attachTo: document.body,
    global: {
      plugins: [createPinia()],
    },
  })
}

describe('BatchJobModal', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  afterEach(() => {
    cleanupBody()
    vi.restoreAllMocks()
  })

  it('renders the configure stage with stale-only selected by default', async () => {
    mountModal({
      modelValue: true,
      title: 'Run entity extraction',
      jobKind: 'entity_extraction',
    })
    await nextTick()

    expect(
      document.body.querySelector('[data-testid="batch-modal-configure"]'),
    ).not.toBeNull()
    const staleRadio = document.body.querySelector(
      '[data-testid="batch-modal-mode-stale"]',
    ) as HTMLInputElement
    expect(staleRadio).not.toBeNull()
    expect(staleRadio.checked).toBe(true)
  })

  it('renders both date inputs in the configure stage', async () => {
    mountModal({
      modelValue: true,
      title: 'Run entity extraction',
      jobKind: 'entity_extraction',
    })
    await nextTick()

    expect(
      document.body.querySelector('[data-testid="batch-modal-start-date"]'),
    ).not.toBeNull()
    expect(
      document.body.querySelector('[data-testid="batch-modal-end-date"]'),
    ).not.toBeNull()
  })

  it('clicking Cancel emits update:modelValue false', async () => {
    const wrapper = mountModal({
      modelValue: true,
      title: 'Run entity extraction',
      jobKind: 'entity_extraction',
    })
    await nextTick()

    const cancel = document.body.querySelector(
      '[data-testid="batch-modal-cancel"]',
    ) as HTMLElement
    cancel.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await nextTick()

    expect(wrapper.emitted('update:modelValue')).toEqual([[false]])
  })

  it('clicking Run with jobKind=entity_extraction and mode=force calls startEntityExtraction with stale_only:false', async () => {
    const wrapper = mountModal({
      modelValue: true,
      title: 'Run entity extraction',
      jobKind: 'entity_extraction',
    })
    await nextTick()

    const store = useJobsStore()
    const spy = vi
      .spyOn(store, 'startEntityExtraction')
      .mockResolvedValue('job-xyz')

    const forceRadio = document.body.querySelector(
      '[data-testid="batch-modal-mode-force"]',
    ) as HTMLInputElement
    forceRadio.checked = true
    forceRadio.dispatchEvent(new Event('change', { bubbles: true }))
    await nextTick()

    const run = document.body.querySelector(
      '[data-testid="batch-modal-run"]',
    ) as HTMLElement
    run.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await flushPromises()

    expect(spy).toHaveBeenCalledTimes(1)
    const arg = spy.mock.calls[0][0] as { stale_only: boolean }
    expect(arg.stale_only).toBe(false)
    // Transition to running stage.
    expect(
      document.body.querySelector('[data-testid="batch-modal-running"]'),
    ).not.toBeNull()
    void wrapper
  })

  it('clicking Run with jobKind=mood_backfill passes mode as a string', async () => {
    mountModal({
      modelValue: true,
      title: 'Run mood backfill',
      jobKind: 'mood_backfill',
    })
    await nextTick()

    const store = useJobsStore()
    const spy = vi
      .spyOn(store, 'startMoodBackfill')
      .mockResolvedValue('job-mood')

    const run = document.body.querySelector(
      '[data-testid="batch-modal-run"]',
    ) as HTMLElement
    run.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await flushPromises()

    expect(spy).toHaveBeenCalledTimes(1)
    const arg = spy.mock.calls[0][0] as { mode: string }
    expect(arg.mode).toBe('stale-only')
  })

  it('after Run resolves, shows the progress bar in the running stage', async () => {
    mountModal({
      modelValue: true,
      title: 'Run entity extraction',
      jobKind: 'entity_extraction',
    })
    await nextTick()

    const store = useJobsStore()
    vi.spyOn(store, 'startEntityExtraction').mockImplementation(
      async (): Promise<string> => {
        store.jobs['job-1'] = makeJob({
          id: 'job-1',
          status: 'running',
          progress_current: 3,
          progress_total: 10,
        })
        return 'job-1'
      },
    )

    const run = document.body.querySelector(
      '[data-testid="batch-modal-run"]',
    ) as HTMLElement
    run.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await flushPromises()

    expect(
      document.body.querySelector('[data-testid="batch-modal-progress-bar"]'),
    ).not.toBeNull()
    expect(
      document.body.querySelector(
        '[data-testid="batch-modal-progress-counter"]',
      )?.textContent,
    ).toContain('3')
  })

  it('when the job transitions to succeeded, emits job-succeeded and shows done stage', async () => {
    const wrapper = mountModal({
      modelValue: true,
      title: 'Run entity extraction',
      jobKind: 'entity_extraction',
    })
    await nextTick()

    const store = useJobsStore()
    vi.spyOn(store, 'startEntityExtraction').mockImplementation(
      async (): Promise<string> => {
        store.jobs['job-1'] = makeJob({ id: 'job-1', status: 'running' })
        return 'job-1'
      },
    )

    const run = document.body.querySelector(
      '[data-testid="batch-modal-run"]',
    ) as HTMLElement
    run.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await flushPromises()

    // Simulate the store poller writing a terminal status.
    store.jobs['job-1'] = makeJob({
      id: 'job-1',
      status: 'succeeded',
      result: { processed: 5, entities_created: 2 },
    })
    await nextTick()
    await nextTick()

    expect(wrapper.emitted('job-succeeded')).toBeTruthy()
    expect(
      document.body.querySelector('[data-testid="batch-modal-done"]'),
    ).not.toBeNull()
  })

  it('when the job transitions to failed, shows the error stage with the error message', async () => {
    mountModal({
      modelValue: true,
      title: 'Run entity extraction',
      jobKind: 'entity_extraction',
    })
    await nextTick()

    const store = useJobsStore()
    vi.spyOn(store, 'startEntityExtraction').mockImplementation(
      async (): Promise<string> => {
        store.jobs['job-1'] = makeJob({ id: 'job-1', status: 'running' })
        return 'job-1'
      },
    )

    const run = document.body.querySelector(
      '[data-testid="batch-modal-run"]',
    ) as HTMLElement
    run.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await flushPromises()

    store.jobs['job-1'] = makeJob({
      id: 'job-1',
      status: 'failed',
      error_message: 'upstream exploded',
    })
    await nextTick()
    await nextTick()

    const err = document.body.querySelector(
      '[data-testid="batch-modal-error"]',
    ) as HTMLElement
    expect(err).not.toBeNull()
    expect(err.textContent).toContain('upstream exploded')
  })

  it('in running stage, Close emits update:modelValue false but does NOT call stopPolling', async () => {
    const wrapper = mountModal({
      modelValue: true,
      title: 'Run entity extraction',
      jobKind: 'entity_extraction',
    })
    await nextTick()

    const store = useJobsStore()
    vi.spyOn(store, 'startEntityExtraction').mockImplementation(
      async (): Promise<string> => {
        store.jobs['job-1'] = makeJob({ id: 'job-1', status: 'running' })
        return 'job-1'
      },
    )
    const stopSpy = vi.spyOn(store, 'stopPolling')

    const run = document.body.querySelector(
      '[data-testid="batch-modal-run"]',
    ) as HTMLElement
    run.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await flushPromises()

    const close = document.body.querySelector(
      '[data-testid="batch-modal-close-running"]',
    ) as HTMLElement
    close.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await nextTick()

    expect(wrapper.emitted('update:modelValue')).toEqual([[false]])
    expect(stopSpy).not.toHaveBeenCalled()
  })

  it('in done stage, Close calls clearJob and closes the modal', async () => {
    const wrapper = mountModal({
      modelValue: true,
      title: 'Run entity extraction',
      jobKind: 'entity_extraction',
    })
    await nextTick()

    const store = useJobsStore()
    vi.spyOn(store, 'startEntityExtraction').mockImplementation(
      async (): Promise<string> => {
        store.jobs['job-1'] = makeJob({ id: 'job-1', status: 'running' })
        return 'job-1'
      },
    )
    const clearSpy = vi.spyOn(store, 'clearJob')

    const run = document.body.querySelector(
      '[data-testid="batch-modal-run"]',
    ) as HTMLElement
    run.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await flushPromises()

    store.jobs['job-1'] = makeJob({
      id: 'job-1',
      status: 'succeeded',
      result: null,
    })
    await nextTick()
    await nextTick()

    const close = document.body.querySelector(
      '[data-testid="batch-modal-close-done"]',
    ) as HTMLElement
    close.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await nextTick()

    expect(clearSpy).toHaveBeenCalledWith('job-1')
    expect(wrapper.emitted('update:modelValue')).toEqual([[false]])
  })

  it('reopening the modal resets state back to the configure stage', async () => {
    const wrapper = mountModal({
      modelValue: true,
      title: 'Run entity extraction',
      jobKind: 'entity_extraction',
    })
    await nextTick()

    const store = useJobsStore()
    vi.spyOn(store, 'startEntityExtraction').mockImplementation(
      async (): Promise<string> => {
        store.jobs['job-1'] = makeJob({ id: 'job-1', status: 'running' })
        return 'job-1'
      },
    )

    const run = document.body.querySelector(
      '[data-testid="batch-modal-run"]',
    ) as HTMLElement
    run.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await flushPromises()

    // Confirm we're in the running stage.
    expect(
      document.body.querySelector('[data-testid="batch-modal-running"]'),
    ).not.toBeNull()

    // Close the modal.
    await wrapper.setProps({ modelValue: false })
    await nextTick()

    // Reopen.
    await wrapper.setProps({ modelValue: true })
    await nextTick()

    expect(
      document.body.querySelector('[data-testid="batch-modal-configure"]'),
    ).not.toBeNull()
    expect(
      document.body.querySelector('[data-testid="batch-modal-running"]'),
    ).toBeNull()
  })

  it('if startEntityExtraction throws, transitions directly to error with the thrown message', async () => {
    mountModal({
      modelValue: true,
      title: 'Run entity extraction',
      jobKind: 'entity_extraction',
    })
    await nextTick()

    const store = useJobsStore()
    vi.spyOn(store, 'startEntityExtraction').mockRejectedValue(
      new Error('server said no'),
    )

    const run = document.body.querySelector(
      '[data-testid="batch-modal-run"]',
    ) as HTMLElement
    run.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await flushPromises()

    const err = document.body.querySelector(
      '[data-testid="batch-modal-error"]',
    ) as HTMLElement
    expect(err).not.toBeNull()
    expect(err.textContent).toContain('server said no')
  })
})
