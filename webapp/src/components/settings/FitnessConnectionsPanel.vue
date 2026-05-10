<script setup lang="ts">
import { onMounted } from 'vue'
import { storeToRefs } from 'pinia'
import { useFitnessStore } from '@/stores/fitness'
import GarminConnectionCard from './GarminConnectionCard.vue'
import StravaConnectionCard from './StravaConnectionCard.vue'

// Reads the shared sync-status store and delegates one card per source.
// Cards own their transient connect/MFA/disconnect/backfill state; this
// panel's only job is hydration on mount and exposing the section anchor
// (`#fitness`) that W10's Strava callback view will redirect back to.

const store = useFitnessStore()
const { syncStatus, loadingStatus, statusError } = storeToRefs(store)

onMounted(() => {
  void store.loadSyncStatus()
})
</script>

<template>
  <section id="fitness" class="mb-8" data-testid="fitness-section">
    <h2 class="text-lg font-semibold text-gray-800 dark:text-gray-200 mb-4">
      Fitness
    </h2>
    <p class="text-xs text-gray-600 dark:text-gray-300 mb-3">
      Connect your fitness accounts so activities and daily wellness rollups
      sync into the local store. Disconnecting keeps your historical data; it
      only stops future syncs.
    </p>
    <p
      v-if="statusError"
      class="text-xs text-rose-700 dark:text-rose-300 mb-3"
      data-testid="fitness-status-error"
    >
      Could not load fitness status: {{ statusError }}
    </p>
    <p
      v-else-if="loadingStatus && !syncStatus.strava && !syncStatus.garmin"
      class="text-xs text-gray-500 dark:text-gray-400 mb-3"
      data-testid="fitness-status-loading"
    >
      Loading…
    </p>
    <div class="space-y-4">
      <GarminConnectionCard :status="syncStatus.garmin" />
      <StravaConnectionCard :status="syncStatus.strava" />
    </div>
  </section>
</template>
