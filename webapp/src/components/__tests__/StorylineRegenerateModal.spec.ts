import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { nextTick } from 'vue'
import StorylineRegenerateModal from '../StorylineRegenerateModal.vue'
import { useStorylinesStore } from '@/stores/storylines'
import { useJobsStore } from '@/stores/jobs'

function cleanupBody(): void {
  document.body.innerHTML = ''
  document.body.style.overflow = ''
}

function mountModal(props: { modelValue: boolean; storylineIds: number[] }) {
  return mount(StorylineRegenerateModal, {
    props,
    attachTo: document.body,
    global: { plugins: [createPinia()] },
  })
}

describe('StorylineRegenerateModal', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  afterEach(() => {
    cleanupBody()
    vi.restoreAllMocks()
  })

  it('renders nothing when closed', () => {
    mountModal({ modelValue: false, storylineIds: [1] })
    expect(
      document.body.querySelector('[data-testid="storyline-regenerate-modal"]'),
    ).toBeNull()
  })

  it('renders both mode radios with replace selected by default', async () => {
    mountModal({ modelValue: true, storylineIds: [1] })
    await nextTick()
    const replaceRadio = document.body.querySelector(
      '[data-testid="storyline-regenerate-mode-replace"]',
    ) as HTMLInputElement
    const appendRadio = document.body.querySelector(
      '[data-testid="storyline-regenerate-mode-append"]',
    ) as HTMLInputElement
    expect(replaceRadio).not.toBeNull()
    expect(appendRadio).not.toBeNull()
    expect(replaceRadio.checked).toBe(true)
    expect(appendRadio.checked).toBe(false)
  })

  it('shows the affected-count caption', async () => {
    mountModal({ modelValue: true, storylineIds: [1, 2, 3] })
    await nextTick()
    expect(
      document.body
        .querySelector('[data-testid="storyline-regenerate-count"]')
        ?.textContent?.trim(),
    ).toContain('3 storyline')
  })

  it('append mode with empty start date disables Submit and shows the warning', async () => {
    mountModal({ modelValue: true, storylineIds: [1] })
    await nextTick()

    const appendRadio = document.body.querySelector(
      '[data-testid="storyline-regenerate-mode-append"]',
    ) as HTMLInputElement
    appendRadio.checked = true
    appendRadio.dispatchEvent(new Event('change', { bubbles: true }))
    await nextTick()

    const submit = document.body.querySelector(
      '[data-testid="storyline-regenerate-submit"]',
    ) as HTMLButtonElement
    expect(submit.disabled).toBe(true)
    expect(
      document.body.querySelector(
        '[data-testid="storyline-regenerate-append-warning"]',
      ),
    ).not.toBeNull()
  })

  it('append mode with start date enables Submit', async () => {
    mountModal({ modelValue: true, storylineIds: [1] })
    await nextTick()

    const appendRadio = document.body.querySelector(
      '[data-testid="storyline-regenerate-mode-append"]',
    ) as HTMLInputElement
    appendRadio.checked = true
    appendRadio.dispatchEvent(new Event('change', { bubbles: true }))
    const start = document.body.querySelector(
      '[data-testid="storyline-regenerate-start-date"]',
    ) as HTMLInputElement
    start.value = '2026-04-01'
    start.dispatchEvent(new Event('input', { bubbles: true }))
    await nextTick()

    const submit = document.body.querySelector(
      '[data-testid="storyline-regenerate-submit"]',
    ) as HTMLButtonElement
    expect(submit.disabled).toBe(false)
  })

  it('replace mode with no dates calls store.regenerate with mode only', async () => {
    const wrapper = mountModal({ modelValue: true, storylineIds: [42] })
    await nextTick()

    const store = useStorylinesStore()
    const regenSpy = vi.spyOn(store, 'regenerate').mockResolvedValue({
      job_id: 'job-a',
      status: 'queued',
    })
    const jobsStore = useJobsStore()
    const trackSpy = vi
      .spyOn(jobsStore, 'trackJob')
      .mockImplementation(() => {})

    const submit = document.body.querySelector(
      '[data-testid="storyline-regenerate-submit"]',
    ) as HTMLElement
    submit.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await flushPromises()

    expect(regenSpy).toHaveBeenCalledWith(42, { mode: 'replace' })
    expect(trackSpy).toHaveBeenCalledWith('job-a', 'storyline_generation', {
      storyline_id: 42,
    })
    expect(wrapper.emitted('submitted')).toBeTruthy()
    expect(wrapper.emitted('update:modelValue')).toContainEqual([false])
  })

  it('forwards start_date and end_date when provided', async () => {
    mountModal({ modelValue: true, storylineIds: [1] })
    await nextTick()

    const store = useStorylinesStore()
    const regenSpy = vi
      .spyOn(store, 'regenerate')
      .mockResolvedValue({ job_id: 'job-b', status: 'queued' })

    const start = document.body.querySelector(
      '[data-testid="storyline-regenerate-start-date"]',
    ) as HTMLInputElement
    start.value = '2026-04-01'
    start.dispatchEvent(new Event('input', { bubbles: true }))
    const end = document.body.querySelector(
      '[data-testid="storyline-regenerate-end-date"]',
    ) as HTMLInputElement
    end.value = '2026-05-01'
    end.dispatchEvent(new Event('input', { bubbles: true }))
    await nextTick()

    const submit = document.body.querySelector(
      '[data-testid="storyline-regenerate-submit"]',
    ) as HTMLElement
    submit.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await flushPromises()

    expect(regenSpy).toHaveBeenCalledWith(1, {
      mode: 'replace',
      start_date: '2026-04-01',
      end_date: '2026-05-01',
    })
  })

  it('multi-storyline submit calls store.regenerate once per id', async () => {
    mountModal({ modelValue: true, storylineIds: [1, 2, 3] })
    await nextTick()
    const store = useStorylinesStore()
    const regenSpy = vi
      .spyOn(store, 'regenerate')
      .mockResolvedValue({ job_id: 'job', status: 'queued' })
    const jobsStore = useJobsStore()
    vi.spyOn(jobsStore, 'trackJob').mockImplementation(() => {})

    const submit = document.body.querySelector(
      '[data-testid="storyline-regenerate-submit"]',
    ) as HTMLElement
    submit.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await flushPromises()

    expect(regenSpy).toHaveBeenCalledTimes(3)
    expect(regenSpy.mock.calls.map((c) => c[0])).toEqual([1, 2, 3])
  })

  it('collects per-id errors when some calls fail and keeps the modal open', async () => {
    const wrapper = mountModal({ modelValue: true, storylineIds: [1, 2] })
    await nextTick()
    const store = useStorylinesStore()
    vi.spyOn(store, 'regenerate').mockImplementation(async (id: number) => {
      if (id === 2) throw new Error('boom')
      return { job_id: `job-${id}`, status: 'queued' }
    })
    const jobsStore = useJobsStore()
    vi.spyOn(jobsStore, 'trackJob').mockImplementation(() => {})

    const submit = document.body.querySelector(
      '[data-testid="storyline-regenerate-submit"]',
    ) as HTMLElement
    submit.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await flushPromises()

    const errors = document.body.querySelector(
      '[data-testid="storyline-regenerate-errors"]',
    )
    expect(errors).not.toBeNull()
    expect(errors?.textContent).toContain('#2')
    // Modal does not close while there are errors but some succeeded.
    const updates = wrapper.emitted('update:modelValue') ?? []
    expect(updates.some((u) => u[0] === false)).toBe(false)
  })

  it('renders the re-segment checkbox unchecked by default with the override checkbox hidden', async () => {
    mountModal({ modelValue: true, storylineIds: [1] })
    await nextTick()
    const resegment = document.body.querySelector(
      '[data-testid="storyline-regenerate-resegment"]',
    ) as HTMLInputElement
    expect(resegment).not.toBeNull()
    expect(resegment.checked).toBe(false)
    expect(
      document.body.querySelector(
        '[data-testid="storyline-regenerate-override-locked"]',
      ),
    ).toBeNull()
  })

  it('checking re-segment reveals the override checkbox and hides the mode/date controls', async () => {
    mountModal({ modelValue: true, storylineIds: [1] })
    await nextTick()

    // Mode + date controls present before re-segment is toggled.
    expect(
      document.body.querySelector(
        '[data-testid="storyline-regenerate-mode-replace"]',
      ),
    ).not.toBeNull()
    expect(
      document.body.querySelector(
        '[data-testid="storyline-regenerate-start-date"]',
      ),
    ).not.toBeNull()

    const resegment = document.body.querySelector(
      '[data-testid="storyline-regenerate-resegment"]',
    ) as HTMLInputElement
    resegment.checked = true
    resegment.dispatchEvent(new Event('change', { bubbles: true }))
    await nextTick()

    // Override checkbox now visible.
    expect(
      document.body.querySelector(
        '[data-testid="storyline-regenerate-override-locked"]',
      ),
    ).not.toBeNull()
    // Mode + date controls hidden.
    expect(
      document.body.querySelector(
        '[data-testid="storyline-regenerate-mode-replace"]',
      ),
    ).toBeNull()
    expect(
      document.body.querySelector(
        '[data-testid="storyline-regenerate-start-date"]',
      ),
    ).toBeNull()
  })

  it('submitting with re-segment checked posts resegment:true and no mode', async () => {
    mountModal({ modelValue: true, storylineIds: [7] })
    await nextTick()

    const store = useStorylinesStore()
    const regenSpy = vi
      .spyOn(store, 'regenerate')
      .mockResolvedValue({ job_id: 'job-r', status: 'queued' })
    const jobsStore = useJobsStore()
    vi.spyOn(jobsStore, 'trackJob').mockImplementation(() => {})

    const resegment = document.body.querySelector(
      '[data-testid="storyline-regenerate-resegment"]',
    ) as HTMLInputElement
    resegment.checked = true
    resegment.dispatchEvent(new Event('change', { bubbles: true }))
    await nextTick()

    const submit = document.body.querySelector(
      '[data-testid="storyline-regenerate-submit"]',
    ) as HTMLElement
    submit.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await flushPromises()

    expect(regenSpy).toHaveBeenCalledWith(7, { resegment: true })
    const body = regenSpy.mock.calls[0][1] as Record<string, unknown>
    expect(body).not.toHaveProperty('mode')
  })

  it('submitting with re-segment + override checked posts both booleans', async () => {
    mountModal({ modelValue: true, storylineIds: [7] })
    await nextTick()

    const store = useStorylinesStore()
    const regenSpy = vi
      .spyOn(store, 'regenerate')
      .mockResolvedValue({ job_id: 'job-r', status: 'queued' })
    const jobsStore = useJobsStore()
    vi.spyOn(jobsStore, 'trackJob').mockImplementation(() => {})

    const resegment = document.body.querySelector(
      '[data-testid="storyline-regenerate-resegment"]',
    ) as HTMLInputElement
    resegment.checked = true
    resegment.dispatchEvent(new Event('change', { bubbles: true }))
    await nextTick()

    const override = document.body.querySelector(
      '[data-testid="storyline-regenerate-override-locked"]',
    ) as HTMLInputElement
    override.checked = true
    override.dispatchEvent(new Event('change', { bubbles: true }))
    await nextTick()

    const submit = document.body.querySelector(
      '[data-testid="storyline-regenerate-submit"]',
    ) as HTMLElement
    submit.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await flushPromises()

    expect(regenSpy).toHaveBeenCalledWith(7, {
      resegment: true,
      override_locked: true,
    })
  })

  it('re-segment toggled on after selecting append never submits append', async () => {
    mountModal({ modelValue: true, storylineIds: [7] })
    await nextTick()

    const store = useStorylinesStore()
    const regenSpy = vi
      .spyOn(store, 'regenerate')
      .mockResolvedValue({ job_id: 'job-r', status: 'queued' })
    const jobsStore = useJobsStore()
    vi.spyOn(jobsStore, 'trackJob').mockImplementation(() => {})

    // Select append + a start date first.
    const appendRadio = document.body.querySelector(
      '[data-testid="storyline-regenerate-mode-append"]',
    ) as HTMLInputElement
    appendRadio.checked = true
    appendRadio.dispatchEvent(new Event('change', { bubbles: true }))
    const start = document.body.querySelector(
      '[data-testid="storyline-regenerate-start-date"]',
    ) as HTMLInputElement
    start.value = '2026-04-01'
    start.dispatchEvent(new Event('input', { bubbles: true }))
    await nextTick()

    // Now switch on re-segment.
    const resegment = document.body.querySelector(
      '[data-testid="storyline-regenerate-resegment"]',
    ) as HTMLInputElement
    resegment.checked = true
    resegment.dispatchEvent(new Event('change', { bubbles: true }))
    await nextTick()

    const submit = document.body.querySelector(
      '[data-testid="storyline-regenerate-submit"]',
    ) as HTMLButtonElement
    expect(submit.disabled).toBe(false)
    submit.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await flushPromises()

    const body = regenSpy.mock.calls[0][1] as Record<string, unknown>
    expect(body).toEqual({ resegment: true })
    expect(body.mode).toBeUndefined()
  })

  it('submitting with re-segment unchecked is unchanged (no resegment key)', async () => {
    mountModal({ modelValue: true, storylineIds: [7] })
    await nextTick()

    const store = useStorylinesStore()
    const regenSpy = vi
      .spyOn(store, 'regenerate')
      .mockResolvedValue({ job_id: 'job-r', status: 'queued' })
    const jobsStore = useJobsStore()
    vi.spyOn(jobsStore, 'trackJob').mockImplementation(() => {})

    const submit = document.body.querySelector(
      '[data-testid="storyline-regenerate-submit"]',
    ) as HTMLElement
    submit.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await flushPromises()

    expect(regenSpy).toHaveBeenCalledWith(7, { mode: 'replace' })
    const body = regenSpy.mock.calls[0][1] as Record<string, unknown>
    expect(body).not.toHaveProperty('resegment')
    expect(body).not.toHaveProperty('override_locked')
  })

  it('resets the re-segment + override refs when reopened', async () => {
    const wrapper = mountModal({ modelValue: true, storylineIds: [1] })
    await nextTick()

    const resegment = document.body.querySelector(
      '[data-testid="storyline-regenerate-resegment"]',
    ) as HTMLInputElement
    resegment.checked = true
    resegment.dispatchEvent(new Event('change', { bubbles: true }))
    await nextTick()
    const override = document.body.querySelector(
      '[data-testid="storyline-regenerate-override-locked"]',
    ) as HTMLInputElement
    override.checked = true
    override.dispatchEvent(new Event('change', { bubbles: true }))
    await nextTick()

    await wrapper.setProps({ modelValue: false })
    await nextTick()
    await wrapper.setProps({ modelValue: true })
    await nextTick()

    const resegmentAfter = document.body.querySelector(
      '[data-testid="storyline-regenerate-resegment"]',
    ) as HTMLInputElement
    expect(resegmentAfter.checked).toBe(false)
    // Override checkbox hidden again once re-segment is unchecked.
    expect(
      document.body.querySelector(
        '[data-testid="storyline-regenerate-override-locked"]',
      ),
    ).toBeNull()
  })

  it('Cancel closes the modal', async () => {
    const wrapper = mountModal({ modelValue: true, storylineIds: [1] })
    await nextTick()
    const cancel = document.body.querySelector(
      '[data-testid="storyline-regenerate-cancel"]',
    ) as HTMLElement
    cancel.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await nextTick()
    expect(wrapper.emitted('update:modelValue')).toContainEqual([false])
  })

  it('resets state when reopened', async () => {
    const wrapper = mountModal({ modelValue: true, storylineIds: [1] })
    await nextTick()

    const appendRadio = document.body.querySelector(
      '[data-testid="storyline-regenerate-mode-append"]',
    ) as HTMLInputElement
    appendRadio.checked = true
    appendRadio.dispatchEvent(new Event('change', { bubbles: true }))
    await nextTick()
    expect(
      (
        document.body.querySelector(
          '[data-testid="storyline-regenerate-mode-append"]',
        ) as HTMLInputElement
      ).checked,
    ).toBe(true)

    await wrapper.setProps({ modelValue: false })
    await nextTick()
    await wrapper.setProps({ modelValue: true })
    await nextTick()

    const replaceRadio = document.body.querySelector(
      '[data-testid="storyline-regenerate-mode-replace"]',
    ) as HTMLInputElement
    expect(replaceRadio.checked).toBe(true)
  })
})
