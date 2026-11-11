<script setup lang="ts">
import { onMounted } from 'vue'
import { storeToRefs } from 'pinia'
import { RouterLink } from 'vue-router'
import { useFitnessStore } from '@/stores/fitness'
import type { FitnessSource } from '@/types/fitness'

// Persistent banner that surfaces broken-source state across every
// authenticated route. The store hydrates `/api/fitness/sync/status`
// on mount; the banner reads `brokenSources` and emits one short copy
// line per source plus a Reconnect button that routes to the fitness
// section of the settings page.
//
// History: this banner used to surface CLI re-auth commands as the
// recovery path. After W2/W3 (server-side per-user connect endpoints)
// and W9 (the fitness section in /settings) shipped, the in-app
// reconnect path exists, so the banner directs there instead. The
// underlying broken-flip behaviour (workers writing
// `auth_status='broken'` on a provider 401) is verified by the W11
// worker-level test on the server side.

const store = useFitnessStore()
const { brokenSources, isAnyAuthBroken } = storeToRefs(store)

function sourceLabel(source: FitnessSource): string {
  return source === 'strava' ? 'Strava' : 'Garmin'
}

onMounted(() => {
  // Lazy-load — the user may already be on /fitness or /settings, in
  // which case those views' onMounted has hydrated already; the store's
  // loadSyncStatus is idempotent and cheap so calling twice is fine.
  void store.loadSyncStatus()
})
</script>

<template>
  <div
    v-if="isAnyAuthBroken"
    class="bg-rose-100 dark:bg-rose-900/40 border-b border-rose-300 dark:border-rose-700 px-4 py-3"
    role="alert"
    data-testid="fitness-auth-banner"
  >
    <div
      class="max-w-[96rem] mx-auto flex flex-wrap items-center justify-between gap-3"
    >
      <div class="flex items-start gap-3 flex-1 min-w-0">
        <svg
          class="shrink-0 fill-current text-rose-600 dark:text-rose-300 mt-0.5"
          xmlns="http://www.w3.org/2000/svg"
          width="20"
          height="20"
          viewBox="0 0 20 20"
        >
          <path
            d="M10 0a10 10 0 1 0 0 20 10 10 0 0 0 0-20Zm1 15H9v-2h2v2Zm0-4H9V5h2v6Z"
          />
        </svg>
        <div class="flex-1 text-sm text-rose-800 dark:text-rose-100">
          <p class="font-semibold">Fitness sync is broken.</p>
          <ul class="mt-1 space-y-0.5">
            <li
              v-for="source in brokenSources"
              :key="source"
              :data-testid="`fitness-banner-${source}`"
            >
              {{ sourceLabel(source) }} can't authenticate. Reconnect to resume
              syncing.
            </li>
          </ul>
        </div>
      </div>
      <RouterLink
        :to="{ path: '/settings', hash: '#fitness' }"
        class="btn-sm bg-rose-600 hover:bg-rose-700 text-white shrink-0"
        data-testid="fitness-banner-reconnect"
      >
        Reconnect
      </RouterLink>
    </div>
  </div>
</template>
