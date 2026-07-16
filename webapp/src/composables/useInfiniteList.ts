import { computed, ref, type ComputedRef, type Ref } from 'vue'
import { useInfiniteScroll } from '@vueuse/core'

/**
 * Shared infinite-scroll primitive.
 *
 * Wires `@vueuse/core`'s `useInfiniteScroll` to a sentinel element (or an
 * explicit scroll container) so reaching the bottom appends the next page,
 * and also exposes a manual `loadMore()` so a visible "Load more" button —
 * and unit tests — can drive appends without a real IntersectionObserver.
 *
 * The observer is only wired when `IntersectionObserver` exists (it is
 * absent under SSR and treated as a no-op stub in some test runners); the
 * manual button path always works, which is why callers must render a
 * "Load more" fallback rather than relying on scroll alone.
 */
export interface UseInfiniteListOptions {
  /** Append the next page. Called when the sentinel enters view or the button is pressed. */
  loadMore: () => void | Promise<void>
  /** Gate: return true only when another page can be fetched (e.g. `hasMore && !loading`). */
  canLoadMore: () => boolean
  /** Optional scroll container to observe. Defaults to the returned `sentinelRef`. */
  scrollTarget?: Ref<HTMLElement | null>
}

export interface UseInfiniteListReturn {
  /** Bind to a bottom-of-list marker element; observed when no `scrollTarget` is given. */
  sentinelRef: Ref<HTMLElement | null>
  /** Manually append the next page (no-op when `canLoadMore()` is false). */
  loadMore: () => Promise<void>
  /** Reactive mirror of the `canLoadMore` predicate. */
  canLoadMore: ComputedRef<boolean>
}

export function useInfiniteList(
  options: UseInfiniteListOptions,
): UseInfiniteListReturn {
  const sentinelRef = ref<HTMLElement | null>(null)
  const canLoadMore = computed(() => options.canLoadMore())

  async function loadMore(): Promise<void> {
    if (!options.canLoadMore()) return
    await options.loadMore()
  }

  // Guard the observer wiring: `useInfiniteScroll` depends on element
  // visibility detection, which needs IntersectionObserver. When it is
  // unavailable the manual "Load more" button remains the fallback.
  if (typeof IntersectionObserver !== 'undefined') {
    const target = options.scrollTarget ?? sentinelRef
    useInfiniteScroll(target, () => loadMore(), {
      distance: 200,
      canLoadMore: () => options.canLoadMore(),
    })
  }

  return { sentinelRef, loadMore, canLoadMore }
}
