import { useRouter, type RouteLocationRaw } from 'vue-router'

/**
 * Returns a `goBack` handler for detail-view "Back" buttons that does a
 * real browser back when there is in-app history to return to, and only
 * falls back to a fixed route when there isn't.
 *
 * Why not just `router.push({ name: 'entities' })`? Detail views are
 * reached from many places — e.g. an entity opened from a storyline.
 * Always pushing the section list sends the user to the entities
 * overview instead of back to the storyline they came from. Browser
 * back returns them to wherever they actually were.
 *
 * Vue Router records the previous in-app location on
 * `window.history.state.back`. It's `null` on a fresh load, a refresh,
 * or when the page was entered directly via a deep link — in those
 * cases `router.back()` would leave the app, so we push `fallback`
 * (the section list) instead.
 */
export function useBackNavigation(fallback: RouteLocationRaw): () => void {
  const router = useRouter()
  return function goBack(): void {
    if (window.history.state?.back != null) {
      router.back()
    } else {
      router.push(fallback)
    }
  }
}
