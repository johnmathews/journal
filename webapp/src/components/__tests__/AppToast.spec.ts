import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import type { VueWrapper } from '@vue/test-utils'
import AppToast from '../AppToast.vue'
import { useToast } from '@/composables/useToast'

describe('AppToast', () => {
  let wrapper: VueWrapper

  beforeEach(() => {
    vi.useFakeTimers()
    // Clear any leftover toasts
    const { toasts } = useToast()
    toasts.value = []
  })

  afterEach(() => {
    wrapper?.unmount()
    vi.useRealTimers()
  })

  function mountToast() {
    wrapper = mount(AppToast, { attachTo: document.body })
    return wrapper
  }

  it('renders nothing when there are no toasts', () => {
    mountToast()
    expect(document.querySelectorAll('[data-testid="toast"]')).toHaveLength(0)
  })

  it('renders a success toast', async () => {
    mountToast()
    const { success } = useToast()

    success('Saved successfully')
    await flushPromises()

    const toastEls = document.querySelectorAll('[data-testid="toast"]')
    expect(toastEls).toHaveLength(1)
    expect(toastEls[0].textContent).toContain('Saved successfully')
  })

  it('renders an error toast', async () => {
    mountToast()
    const { error } = useToast()

    error('Something failed')
    await flushPromises()

    const toastEls = document.querySelectorAll('[data-testid="toast"]')
    expect(toastEls).toHaveLength(1)
    expect(toastEls[0].textContent).toContain('Something failed')
  })

  it('renders multiple toasts', async () => {
    mountToast()
    const { success, error } = useToast()

    success('First')
    error('Second')
    await flushPromises()

    const toastEls = document.querySelectorAll('[data-testid="toast"]')
    expect(toastEls).toHaveLength(2)
  })

  it('removes toast after duration elapses', async () => {
    mountToast()
    const { success } = useToast()

    success('Temporary')
    await flushPromises()
    expect(document.querySelectorAll('[data-testid="toast"]')).toHaveLength(1)

    vi.advanceTimersByTime(5000)
    await flushPromises()
    expect(document.querySelectorAll('[data-testid="toast"]')).toHaveLength(0)
  })
})
