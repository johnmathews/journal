import { describe, it, expect, vi } from 'vitest'
import { effectScope, ref } from 'vue'
import { useInfiniteList } from '../useInfiniteList'

// The composable wires `useInfiniteScroll` (which registers scope-disposal
// hooks) when IntersectionObserver exists. Running inside an effectScope
// keeps those hooks contained and disposed cleanly between tests. The
// observer never reports the (unattached) sentinel as visible, so nothing
// auto-fires — these tests exercise the manual `loadMore` gate directly.
function withScope<T>(fn: () => T): { result: T; dispose: () => void } {
  const scope = effectScope()
  const result = scope.run(fn) as T
  return { result, dispose: () => scope.stop() }
}

describe('useInfiniteList', () => {
  it('manual loadMore invokes the callback when canLoadMore is true', async () => {
    const loadMore = vi.fn()
    const { result, dispose } = withScope(() =>
      useInfiniteList({ loadMore, canLoadMore: () => true }),
    )

    await result.loadMore()

    expect(loadMore).toHaveBeenCalledTimes(1)
    dispose()
  })

  it('manual loadMore does NOT invoke the callback when canLoadMore is false', async () => {
    const loadMore = vi.fn()
    const { result, dispose } = withScope(() =>
      useInfiniteList({ loadMore, canLoadMore: () => false }),
    )

    await result.loadMore()

    expect(loadMore).not.toHaveBeenCalled()
    dispose()
  })

  it('awaits an async loadMore callback', async () => {
    let resolved = false
    const loadMore = vi.fn(async () => {
      await Promise.resolve()
      resolved = true
    })
    const { result, dispose } = withScope(() =>
      useInfiniteList({ loadMore, canLoadMore: () => true }),
    )

    await result.loadMore()

    expect(resolved).toBe(true)
    dispose()
  })

  it('exposes canLoadMore as a reactive computed mirror of the predicate', () => {
    const gate = ref(false)
    const { result, dispose } = withScope(() =>
      useInfiniteList({ loadMore: vi.fn(), canLoadMore: () => gate.value }),
    )

    expect(result.canLoadMore.value).toBe(false)
    gate.value = true
    expect(result.canLoadMore.value).toBe(true)
    dispose()
  })

  it('returns a sentinelRef initialised to null', () => {
    const { result, dispose } = withScope(() =>
      useInfiniteList({ loadMore: vi.fn(), canLoadMore: () => true }),
    )

    expect(result.sentinelRef.value).toBeNull()
    dispose()
  })
})
