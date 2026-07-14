<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { exchangeStravaCode } from '@/api/fitness'
import { ApiRequestError } from '@/api/client'
import { useSettingsStore } from '@/stores/settings'

// Landing page for Strava's OAuth redirect (per plan §5 W10).
// The flow:
//   1. SPA: GarminConnectionCard's sibling (StravaConnectionCard) calls
//      getStravaAuthorizeUrl and sets window.location to Strava's
//      authorize URL.
//   2. Strava: user grants or denies; redirects back here with either
//      ?code=…&state=… (granted) or ?error=… (denied / OAuth error).
//   3. This view: surface a transient "Connecting…" spinner while it
//      POSTs to /api/fitness/strava/exchange, then redirects back into
//      /settings#fitness with either a success state or
//      ?strava_error=<reason> on failure.
//
// The view never lingers — the redirect fires from onMounted. Tests
// observe redirect outcomes via the mocked router's `push` calls.

const route = useRoute()
const router = useRouter()
const settingsStore = useSettingsStore()

const status = ref<'pending' | 'error'>('pending')
const errorReason = ref<string | null>(null)

function settingsRedirect(stravaError?: string): {
  path: string
  hash: string
  query?: Record<string, string>
} {
  return stravaError
    ? {
        path: '/settings',
        hash: '#fitness',
        query: { strava_error: stravaError },
      }
    : { path: '/settings', hash: '#fitness' }
}

function pickQueryParam(value: unknown): string | null {
  // Vue Router types query as `LocationQueryValue | LocationQueryValue[]`.
  // For our purposes a duplicate `?code=a&code=b` is malformed input —
  // treat any non-string as "missing" rather than guessing which to use.
  return typeof value === 'string' && value.length > 0 ? value : null
}

async function complete(): Promise<void> {
  // Strava is mothballed behind the server-driven `features.strava_enabled`
  // flag. Wait for settings (fail closed: unknown or failed load ⇒
  // disabled) and bounce straight back to Settings · Fitness without ever
  // touching the exchange API when disabled — the server 404s those
  // routes anyway.
  await settingsStore.ensureLoaded()
  if (!(settingsStore.settings?.features.strava_enabled ?? false)) {
    await router.replace(settingsRedirect())
    return
  }

  const errorParam = pickQueryParam(route.query.error)
  if (errorParam) {
    // The user denied authorization (or Strava itself failed). The
    // upstream `error` query is opaque; surface it directly so the
    // panel can show e.g. "access_denied" without invention.
    await router.replace(settingsRedirect(errorParam))
    return
  }

  const code = pickQueryParam(route.query.code)
  const state = pickQueryParam(route.query.state)
  if (!code || !state) {
    await router.replace(settingsRedirect('missing_params'))
    return
  }

  try {
    await exchangeStravaCode({ code, state })
    await router.replace(settingsRedirect())
  } catch (e) {
    // Map the server's machine-readable `reason` codes onto the
    // strava_error query param the panel surfaces. Anything else falls
    // back to 'exchange_failed' so the panel can show a generic
    // message instead of leaking an opaque HTTP status.
    let reason = 'exchange_failed'
    if (e instanceof ApiRequestError) {
      const r =
        e.body && typeof e.body.reason === 'string' ? e.body.reason : null
      if (r) reason = r
    }
    status.value = 'error'
    errorReason.value = reason
    await router.replace(settingsRedirect(reason))
  }
}

onMounted(() => {
  void complete()
})
</script>

<template>
  <main
    class="px-4 sm:px-6 lg:px-8 py-16 w-full max-w-md mx-auto text-center"
    data-testid="strava-callback-view"
  >
    <template v-if="status === 'pending'">
      <div
        class="inline-block animate-pulse text-sm text-gray-700 dark:text-gray-300"
        data-testid="strava-callback-pending"
      >
        Connecting Strava…
      </div>
    </template>
    <template v-else>
      <div
        class="text-sm text-rose-700 dark:text-rose-300"
        data-testid="strava-callback-error"
      >
        Strava connection failed ({{ errorReason }}). Returning to settings…
      </div>
    </template>
  </main>
</template>
