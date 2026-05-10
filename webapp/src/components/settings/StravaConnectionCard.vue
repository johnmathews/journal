<script setup lang="ts">
import { ref, computed } from 'vue'
import { getStravaAuthorizeUrl, disconnectStrava } from '@/api/fitness'
import { ApiRequestError } from '@/api/client'
import { useFitnessStore } from '@/stores/fitness'
import FitnessBackfillForm from './FitnessBackfillForm.vue'
import type { FitnessSourceStatus } from '@/types/fitness'

const props = defineProps<{
  status: FitnessSourceStatus | null
}>()

const store = useFitnessStore()

// Two transient UI flags. Strava doesn't have the MFA branching that
// Garmin does — the click → fetch authorize URL → redirect flow is
// linear, so a single `redirecting` flag covers it. Disconnect is
// surfaced independently so the user can hit either button without one
// disabling the other.
const redirecting = ref(false)
const disconnecting = ref(false)
const error = ref<string | null>(null)

type ConnectionState = 'not-connected' | 'connected' | 'broken'

const connectionState = computed<ConnectionState>(() => {
  if (!props.status) return 'not-connected'
  if (props.status.auth_status === 'broken') return 'broken'
  return 'connected'
})

async function startAuthorize(): Promise<void> {
  redirecting.value = true
  error.value = null
  try {
    const resp = await getStravaAuthorizeUrl()
    // Same-tab redirect (per plan §5 W9): the callback route comes
    // back into the SPA naturally, and the user's settings page state
    // does not need to be preserved across the OAuth round trip.
    window.location.href = resp.authorize_url
  } catch (e) {
    error.value = errorMessage(e, 'Could not start Strava authorization.')
    redirecting.value = false
  }
}

async function onDisconnect(): Promise<void> {
  disconnecting.value = true
  error.value = null
  try {
    await disconnectStrava()
    await store.loadSyncStatus()
  } catch (e) {
    error.value = errorMessage(e, 'Disconnect failed.')
  } finally {
    disconnecting.value = false
  }
}

function errorMessage(e: unknown, fallback: string): string {
  if (e instanceof ApiRequestError) {
    return e.message || fallback
  }
  if (e instanceof Error) return e.message
  return fallback
}

function formatDate(iso: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}
</script>

<template>
  <div
    class="p-4 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700/60 rounded-xl shadow-xs"
    data-testid="strava-connection-card"
  >
    <div class="flex items-start justify-between gap-4">
      <div class="flex-1 min-w-0">
        <p class="text-sm font-semibold text-gray-800 dark:text-gray-200">
          Strava
        </p>
        <p
          class="text-xs text-gray-600 dark:text-gray-300 mt-1"
          data-testid="strava-status-line"
        >
          <template v-if="connectionState === 'not-connected'">
            Not connected.
          </template>
          <template v-else-if="connectionState === 'broken'">
            Connection broken since
            {{ formatDate(status?.auth_broken_since ?? null) }}.
          </template>
          <template v-else>
            Connected. Last sync:
            {{ formatDate(status?.last_success_at ?? null) }}.
          </template>
        </p>
      </div>
      <div class="flex flex-wrap items-center gap-2 shrink-0">
        <button
          v-if="connectionState === 'not-connected'"
          type="button"
          class="btn-sm bg-violet-500 hover:bg-violet-600 text-white disabled:opacity-50"
          :disabled="redirecting"
          data-testid="strava-connect-btn"
          @click="startAuthorize"
        >
          {{ redirecting ? 'Redirecting…' : 'Connect Strava' }}
        </button>
        <button
          v-if="connectionState === 'broken'"
          type="button"
          class="btn-sm bg-violet-500 hover:bg-violet-600 text-white disabled:opacity-50"
          :disabled="redirecting"
          data-testid="strava-reconnect-btn"
          @click="startAuthorize"
        >
          {{ redirecting ? 'Redirecting…' : 'Reconnect' }}
        </button>
        <button
          v-if="connectionState === 'connected' || connectionState === 'broken'"
          type="button"
          class="btn-sm bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600 disabled:opacity-50"
          :disabled="disconnecting"
          data-testid="strava-disconnect-btn"
          @click="onDisconnect"
        >
          {{ disconnecting ? 'Disconnecting…' : 'Disconnect' }}
        </button>
      </div>
    </div>

    <p
      v-if="error"
      class="mt-3 text-xs text-rose-700 dark:text-rose-300"
      data-testid="strava-error"
    >
      {{ error }}
    </p>

    <FitnessBackfillForm
      v-if="connectionState === 'connected'"
      source="strava"
    />
  </div>
</template>
