import { ref, onScopeDispose } from 'vue'

/**
 * Prevents the screen from sleeping while active.
 * Uses the Screen Wake Lock API (supported by all major browsers since May 2024).
 * Automatically re-acquires the lock when the page becomes visible again
 * (the browser releases wake locks when the tab is hidden).
 */
export function useWakeLock() {
  const isSupported = 'wakeLock' in navigator
  const isActive = ref(false)
  let sentinel: WakeLockSentinel | null = null
  let requested = false

  async function request(): Promise<void> {
    requested = true
    if (!isSupported) return
    try {
      sentinel = await navigator.wakeLock.request('screen')
      isActive.value = true
      sentinel.addEventListener('release', () => {
        isActive.value = false
        sentinel = null
      })
    } catch {
      // Request can be denied: low battery, power-save mode, page not visible
      isActive.value = false
    }
  }

  async function release(): Promise<void> {
    requested = false
    if (sentinel) {
      await sentinel.release()
      sentinel = null
    }
    isActive.value = false
  }

  function handleVisibilityChange() {
    if (requested && document.visibilityState === 'visible') {
      request()
    }
  }

  document.addEventListener('visibilitychange', handleVisibilityChange)

  onScopeDispose(() => {
    document.removeEventListener('visibilitychange', handleVisibilityChange)
    if (sentinel) {
      sentinel.release()
      sentinel = null
    }
    isActive.value = false
    requested = false
  })

  return { isSupported, isActive, request, release }
}
