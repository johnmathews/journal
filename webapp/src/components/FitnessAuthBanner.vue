<script setup lang="ts">
import { onMounted } from 'vue'
import { storeToRefs } from 'pinia'
import { useFitnessStore } from '@/stores/fitness'
import type { FitnessSource } from '@/types/fitness'

// Persistent banner that surfaces broken-source state across every
// authenticated route. The store hydrates `/api/fitness/sync/status`
// on mount; the banner reads `brokenSources` and emits one short copy
// line per source pointing at the CLI re-auth path documented in
// fitness-operations.md §2.
//
// Why CLI-only: an in-app re-auth flow is explicitly out of scope per
// the W15 brief. The banner's job is to surface the failure and direct
// the operator at the recovery command, not to embed an OAuth round
// trip.

const store = useFitnessStore()
const { brokenSources, isAnyAuthBroken } = storeToRefs(store)

function commandFor(source: FitnessSource): string {
  return source === 'strava'
    ? 'journal fitness-reauth-strava'
    : 'journal fitness-reauth-garmin'
}

function sourceLabel(source: FitnessSource): string {
  return source === 'strava' ? 'Strava' : 'Garmin'
}

onMounted(() => {
  // Lazy-load — the user may already be on /fitness, in which case
  // FitnessView's onMounted has hydrated already; the store's
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
    <div class="max-w-[96rem] mx-auto flex flex-wrap items-start gap-3">
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
            {{ sourceLabel(source) }} can't authenticate. Run
            <code
              class="font-mono px-1 py-0.5 rounded bg-rose-200 dark:bg-rose-800/60"
              >{{ commandFor(source) }}</code
            >
            on the server to recover. See
            <span class="font-semibold">docs/fitness-operations.md §2</span>
            for the headless workaround.
          </li>
        </ul>
      </div>
    </div>
  </div>
</template>
