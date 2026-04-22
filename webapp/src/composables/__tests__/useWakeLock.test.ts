import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { effectScope } from 'vue'
import { useWakeLock } from '../useWakeLock'

function createMockSentinel() {
  const listeners: Record<string, ((...args: unknown[]) => void)[]> = {}
  return {
    released: false,
    addEventListener(event: string, cb: (...args: unknown[]) => void) {
      listeners[event] = listeners[event] || []
      listeners[event].push(cb)
    },
    removeEventListener: vi.fn(),
    async release() {
      this.released = true
      listeners['release']?.forEach((cb) => cb())
    },
  } as unknown as WakeLockSentinel
}

describe('useWakeLock', () => {
  let mockRequest: ReturnType<typeof vi.fn>
  let scope: ReturnType<typeof effectScope>

  beforeEach(() => {
    mockRequest = vi.fn()
    Object.defineProperty(navigator, 'wakeLock', {
      value: { request: mockRequest },
      writable: true,
      configurable: true,
    })
    scope = effectScope()
  })

  afterEach(() => {
    scope.stop()
    // Clean up the mock — delete so 'wakeLock' in navigator is false
    delete (navigator as Record<string, unknown>).wakeLock
  })

  it('reports isSupported when wakeLock API exists', () => {
    let result: ReturnType<typeof useWakeLock>
    scope.run(() => {
      result = useWakeLock()
    })
    expect(result!.isSupported).toBe(true)
  })

  it('reports not supported when wakeLock API is missing', () => {
    delete (navigator as Record<string, unknown>).wakeLock
    let result: ReturnType<typeof useWakeLock>
    scope.run(() => {
      result = useWakeLock()
    })
    expect(result!.isSupported).toBe(false)
  })

  it('request() acquires wake lock and sets isActive', async () => {
    const sentinel = createMockSentinel()
    mockRequest.mockResolvedValue(sentinel)

    let result: ReturnType<typeof useWakeLock>
    scope.run(() => {
      result = useWakeLock()
    })

    await result!.request()
    expect(mockRequest).toHaveBeenCalledWith('screen')
    expect(result!.isActive.value).toBe(true)
  })

  it('release() releases wake lock and clears isActive', async () => {
    const sentinel = createMockSentinel()
    mockRequest.mockResolvedValue(sentinel)

    let result: ReturnType<typeof useWakeLock>
    scope.run(() => {
      result = useWakeLock()
    })

    await result!.request()
    expect(result!.isActive.value).toBe(true)

    await result!.release()
    expect(sentinel.released).toBe(true)
    expect(result!.isActive.value).toBe(false)
  })

  it('handles request() failure gracefully', async () => {
    mockRequest.mockRejectedValue(new DOMException('Not allowed'))

    let result: ReturnType<typeof useWakeLock>
    scope.run(() => {
      result = useWakeLock()
    })

    // Should not throw
    await result!.request()
    expect(result!.isActive.value).toBe(false)
  })

  it('sets isActive to false when sentinel is released externally', async () => {
    const sentinel = createMockSentinel()
    mockRequest.mockResolvedValue(sentinel)

    let result: ReturnType<typeof useWakeLock>
    scope.run(() => {
      result = useWakeLock()
    })

    await result!.request()
    expect(result!.isActive.value).toBe(true)

    // Simulate the browser releasing the lock (e.g., tab hidden)
    await sentinel.release()
    expect(result!.isActive.value).toBe(false)
  })

  it('re-acquires wake lock on visibilitychange when requested', async () => {
    const sentinel1 = createMockSentinel()
    const sentinel2 = createMockSentinel()
    mockRequest
      .mockResolvedValueOnce(sentinel1)
      .mockResolvedValueOnce(sentinel2)

    let result: ReturnType<typeof useWakeLock>
    scope.run(() => {
      result = useWakeLock()
    })

    await result!.request()
    expect(mockRequest).toHaveBeenCalledTimes(1)

    // Simulate tab becoming visible again
    Object.defineProperty(document, 'visibilityState', {
      value: 'visible',
      writable: true,
      configurable: true,
    })
    document.dispatchEvent(new Event('visibilitychange'))

    // Wait for the async request to complete
    await vi.waitFor(() => {
      expect(mockRequest).toHaveBeenCalledTimes(2)
    })
  })

  it('does not re-acquire on visibilitychange after release()', async () => {
    const sentinel = createMockSentinel()
    mockRequest.mockResolvedValue(sentinel)

    let result: ReturnType<typeof useWakeLock>
    scope.run(() => {
      result = useWakeLock()
    })

    await result!.request()
    await result!.release()

    Object.defineProperty(document, 'visibilityState', {
      value: 'visible',
      writable: true,
      configurable: true,
    })
    document.dispatchEvent(new Event('visibilitychange'))

    // Only the initial request, no re-acquire
    expect(mockRequest).toHaveBeenCalledTimes(1)
  })

  it('does nothing on request() when API is not supported', async () => {
    delete (navigator as Record<string, unknown>).wakeLock

    let result: ReturnType<typeof useWakeLock>
    scope.run(() => {
      result = useWakeLock()
    })

    await result!.request()
    expect(result!.isActive.value).toBe(false)
  })

  it('release() is safe to call when no lock is held', async () => {
    let result: ReturnType<typeof useWakeLock>
    scope.run(() => {
      result = useWakeLock()
    })

    // Should not throw
    await result!.release()
    expect(result!.isActive.value).toBe(false)
  })

  it('cleans up event listener and releases lock on scope dispose', async () => {
    const sentinel = createMockSentinel()
    mockRequest.mockResolvedValue(sentinel)

    const localScope = effectScope()
    let result: ReturnType<typeof useWakeLock>
    localScope.run(() => {
      result = useWakeLock()
    })

    await result!.request()
    expect(result!.isActive.value).toBe(true)

    localScope.stop()

    expect(sentinel.released).toBe(true)
    expect(result!.isActive.value).toBe(false)

    // Verify event listener is cleaned up by dispatching event —
    // should not trigger another request
    mockRequest.mockClear()
    Object.defineProperty(document, 'visibilityState', {
      value: 'visible',
      writable: true,
      configurable: true,
    })
    document.dispatchEvent(new Event('visibilitychange'))
    expect(mockRequest).not.toHaveBeenCalled()
  })
})
