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
