<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { storeToRefs } from 'pinia'
import { useFitnessStore } from '@/stores/fitness'
import { useSettingsStore } from '@/stores/settings'
import GarminConnectionCard from './GarminConnectionCard.vue'
import StravaConnectionCard from './StravaConnectionCard.vue'

// Reads the shared sync-status store and delegates one card per source.
// Cards own their transient connect/MFA/disconnect/backfill state; this
// panel's only job is hydration on mount, surfacing the strava_error
// query param the W10 callback view bounces back with on failure, and
// exposing the `#fitness` section anchor.

const store = useFitnessStore()
const { syncStatus, loadingStatus, statusError } = storeToRefs(store)

const route = useRoute()

// Strava is mothballed behind the server-driven `features.strava_enabled`
// flag (GET /api/settings). Fail closed: until settings load (or if the
// load fails), treat Strava as disabled — matching the server default —
// so the card and the ?strava_error handling stay hidden.
const settingsStore = useSettingsStore()
const stravaEnabled = computed(
  () => settingsStore.settings?.features.strava_enabled ?? false,
)

// W10's StravaCallbackView redirects to /settings#fitness with
// ?strava_error=<reason> on any failure (denied, expired state,
// upstream error, etc.). Surface it inline so the user knows the
// OAuth round trip failed; the reason codes mirror the server's
// `reason` field (see api.md § Strava OAuth endpoints). Skipped entirely
// while Strava is disabled — a stale ?strava_error param must not surface
// UI for a mothballed integration.
const stravaError = computed<string | null>(() => {
  if (!stravaEnabled.value) return null
  const v = route.query.strava_error
  return typeof v === 'string' && v.length > 0 ? v : null
})

const stravaErrorMessage = computed<string | null>(() => {
  switch (stravaError.value) {
    case null:
      return null
    case 'access_denied':
      return 'Strava connection cancelled — you denied authorization.'
    case 'expired_pending_state':
      return 'The Strava authorization expired before it could complete. Try Connect again.'
    case 'cross_user_pending_session':
      return 'That Strava authorization belongs to another account.'
    case 'upstream_account_mismatch':
      return 'The returning Strava account differs from the one currently connected. Disconnect first.'
    case 'missing_params':
      return 'Strava did not return an authorization code. Try Connect again.'
    case 'exchange_failed':
      return 'Strava connection failed. Try Connect again.'
    default:
      return `Strava connection failed: ${stravaError.value}.`
  }
})

onMounted(() => {
  void store.loadSyncStatus()
  // No-op when SettingsView (or anything else) already loaded settings.
  void settingsStore.ensureLoaded()
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
      v-if="stravaErrorMessage"
      class="text-xs text-rose-700 dark:text-rose-300 mb-3"
      data-testid="fitness-strava-callback-error"
      role="alert"
    >
      {{ stravaErrorMessage }}
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
      <StravaConnectionCard v-if="stravaEnabled" :status="syncStatus.strava" />
    </div>
  </section>
</template>
