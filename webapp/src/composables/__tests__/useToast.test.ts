import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { useToast } from '../useToast'

describe('useToast', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    // Clear any leftover toasts from previous tests
    const { toasts } = useToast()
    toasts.value = []
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('starts with empty toasts', () => {
    const { toasts } = useToast()
    expect(toasts.value).toEqual([])
  })

  it('adds a toast with show()', () => {
    const { toasts, show } = useToast()
    show('Hello', 'info')
    expect(toasts.value).toHaveLength(1)
    expect(toasts.value[0].message).toBe('Hello')
    expect(toasts.value[0].type).toBe('info')
  })

  it('success() adds a success toast', () => {
    const { toasts, success } = useToast()
    success('Saved')
    expect(toasts.value).toHaveLength(1)
    expect(toasts.value[0].type).toBe('success')
    expect(toasts.value[0].message).toBe('Saved')
  })

  it('error() adds an error toast', () => {
    const { toasts, error } = useToast()
    error('Failed')
    expect(toasts.value).toHaveLength(1)
    expect(toasts.value[0].type).toBe('error')
    expect(toasts.value[0].message).toBe('Failed')
  })

  it('auto-dismisses after default duration (5000ms)', () => {
    const { toasts, show } = useToast()
    show('Temporary')
    expect(toasts.value).toHaveLength(1)

    vi.advanceTimersByTime(4999)
    expect(toasts.value).toHaveLength(1)

    vi.advanceTimersByTime(1)
    expect(toasts.value).toHaveLength(0)
  })

  it('respects custom duration', () => {
    const { toasts, show } = useToast()
    show('Quick', 'info', 1000)
    expect(toasts.value).toHaveLength(1)

    vi.advanceTimersByTime(1000)
    expect(toasts.value).toHaveLength(0)
  })

  it('dismiss() removes a specific toast immediately', () => {
    const { toasts, show, dismiss } = useToast()
    show('First')
    show('Second')
    expect(toasts.value).toHaveLength(2)

    const firstId = toasts.value[0].id
    dismiss(firstId)
    expect(toasts.value).toHaveLength(1)
    expect(toasts.value[0].message).toBe('Second')
  })

  it('assigns unique ids to each toast', () => {
    const { toasts, show } = useToast()
    show('A')
    show('B')
    show('C')
    const ids = toasts.value.map((t) => t.id)
    expect(new Set(ids).size).toBe(3)
  })

  it('shares state across multiple useToast() calls', () => {
    const a = useToast()
    const b = useToast()
    a.success('From A')
    expect(b.toasts.value).toHaveLength(1)
    expect(b.toasts.value[0].message).toBe('From A')
  })
})
