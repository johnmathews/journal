<script setup lang="ts">
import { computed } from 'vue'
import { storeToRefs } from 'pinia'
import { useFitnessStore } from '@/stores/fitness'
import { useSettingsStore } from '@/stores/settings'
import type {
  FitnessSource,
  FitnessSourceStatus,
  FitnessSyncRun,
} from '@/types/fitness'

// One panel per source showing auth status, last success, a "Sync now"
// button, and a collapsible Recent runs table. Extracted from
// FitnessView so the /fitness page can focus on charts and the sync
// controls live in Settings · Fitness next to the Strava/Garmin
// connect cards.
//
// T7 (2026-05-11) split the Recent-runs "Fetched" / "Norm." pair into
// separate Workouts and Wellness columns. Garmin shows both columns
// (it's the only source that yields wellness data). Strava shows only
// Workouts — its wellness counts are always 0 by design. Pre-T7 rows
// in the DB have 0 for the new bucket columns; we fall back to the
// legacy ``rows_fetched`` / ``rows_normalized`` totals so historical
// rows don't suddenly read as zero-yield.

const store = useFitnessStore()
const { syncStatus, triggeringSync, syncError } = storeToRefs(store)

// Strava is mothballed behind the server-driven `features.strava_enabled`
// flag. Fail closed: until settings load (or on load failure), show only
// the Garmin panel — matching the server default of disabled.
const settingsStore = useSettingsStore()
void settingsStore.ensureLoaded()
const sources = computed<FitnessSource[]>(() =>
  (settingsStore.settings?.features.strava_enabled ?? false)
    ? ['strava', 'garmin']
    : ['garmin'],
)

function sourceLabel(source: FitnessSource): string {
  return source === 'strava' ? 'Strava' : 'Garmin'
}

interface CountCell {
  workouts: string
  wellness: string
}

function formatCounts(run: FitnessSyncRun, source: FitnessSource): CountCell {
  // Pre-T7 rows have 0 for the new bucket counts but may have non-zero
  // ``rows_fetched`` (and, for runs that happened after F1, ``rows_normalized``).
  // Push the legacy total into the most likely bucket so the column
  // doesn't lie about historical rows: Strava → workouts; Garmin →
  // wellness (which dominates day-to-day for Garmin syncs).
  const newBucketsEmpty =
    run.workouts_fetched === 0 &&
    run.wellness_fetched === 0 &&
    run.workouts_normalized === 0 &&
    run.wellness_normalized === 0
  if (newBucketsEmpty && (run.rows_fetched > 0 || run.rows_normalized > 0)) {
    const fallback = `${run.rows_fetched} / ${run.rows_normalized}`
    return source === 'strava'
      ? { workouts: fallback, wellness: '—' }
      : { workouts: '—', wellness: fallback }
  }
  return {
    workouts: `${run.workouts_fetched} / ${run.workouts_normalized}`,
    wellness: `${run.wellness_fetched} / ${run.wellness_normalized}`,
  }
}

function formatTimestamp(ts: string | null): string {
  if (!ts) return '—'
  const d = new Date(ts)
  if (Number.isNaN(d.getTime())) return ts
  return d.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function authStatusLabel(s: FitnessSourceStatus | null): string {
  if (!s) return 'Not connected'
  if (s.auth_status === 'ok') return 'OK'
  if (s.auth_status === 'broken') return 'Broken'
  return 'Unknown'
}

function authStatusClass(s: FitnessSourceStatus | null): string {
  if (!s) return 'text-gray-500 dark:text-gray-400'
  if (s.auth_status === 'broken') return 'text-rose-500'
  if (s.auth_status === 'ok') return 'text-emerald-500'
  return 'text-amber-500'
}

function lastRunStatusClass(status: string): string {
  if (status === 'success') return 'text-emerald-500'
  if (status === 'auth_broken') return 'text-rose-500'
  if (status === 'transient_failure') return 'text-amber-500'
  return 'text-gray-500 dark:text-gray-400'
}

async function onSyncClick(source: FitnessSource) {
  await store.startSync(source)
}
</script>

<template>
  <section
    class="grid grid-cols-1 md:grid-cols-2 gap-4"
    data-testid="fitness-sync-panels"
  >
    <article
      v-for="source in sources"
      :key="source"
      class="rounded-xl bg-white dark:bg-gray-800 shadow-xs p-5"
      :data-testid="`fitness-source-card-${source}`"
    >
      <header class="flex items-baseline justify-between mb-3">
        <h2 class="text-lg font-semibold text-gray-800 dark:text-gray-100">
          {{ sourceLabel(source) }}
        </h2>
        <span
          class="text-sm font-medium"
          :class="authStatusClass(syncStatus[source])"
          :data-testid="`fitness-${source}-auth-status`"
        >
          {{ authStatusLabel(syncStatus[source]) }}
        </span>
      </header>
      <dl class="text-sm space-y-1 mb-3">
        <div class="flex justify-between">
          <dt class="text-gray-500 dark:text-gray-400">Last success</dt>
          <dd class="text-gray-700 dark:text-gray-200">
            {{ formatTimestamp(syncStatus[source]?.last_success_at ?? null) }}
          </dd>
        </div>
        <div
          v-if="syncStatus[source]?.auth_broken_since"
          class="flex justify-between"
        >
          <dt class="text-gray-500 dark:text-gray-400">Broken since</dt>
          <dd class="text-rose-500">
            {{ formatTimestamp(syncStatus[source]?.auth_broken_since ?? null) }}
          </dd>
        </div>
      </dl>
      <button
        type="button"
        class="btn bg-violet-500 hover:bg-violet-600 text-white text-sm w-full disabled:opacity-50"
        :disabled="triggeringSync[source]"
        :data-testid="`fitness-${source}-sync-btn`"
        @click="onSyncClick(source)"
      >
        {{ triggeringSync[source] ? 'Queueing…' : 'Sync now' }}
      </button>
      <p
        v-if="syncError[source]"
        class="text-xs text-rose-500 mt-2"
        :data-testid="`fitness-${source}-sync-error`"
      >
        {{ syncError[source] }}
      </p>
      <details
        v-if="syncStatus[source]?.last_runs?.length"
        class="mt-4 text-xs text-gray-600 dark:text-gray-300"
      >
        <summary class="cursor-pointer">
          Recent runs ({{ syncStatus[source]?.last_runs.length }})
        </summary>
        <div class="overflow-x-auto">
          <table class="w-full min-w-[24rem] mt-2">
            <thead>
              <tr class="text-left text-gray-500">
                <th class="font-medium">Started</th>
                <th class="font-medium">Status</th>
                <th
                  class="font-medium text-right"
                  title="F/N = Fetched / Normalized"
                >
                  Workouts F/N
                </th>
                <th
                  v-if="source === 'garmin'"
                  class="font-medium text-right"
                  title="F/N = Fetched / Normalized"
                >
                  Wellness F/N
                </th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="run in syncStatus[source]?.last_runs"
                :key="run.id"
                class="border-t border-gray-100 dark:border-gray-700"
              >
                <td>{{ formatTimestamp(run.started_at) }}</td>
                <td :class="lastRunStatusClass(run.status)">
                  {{ run.status }}
                </td>
                <td class="text-right">
                  {{ formatCounts(run, source).workouts }}
                </td>
                <td v-if="source === 'garmin'" class="text-right">
                  {{ formatCounts(run, source).wellness }}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <p
          class="mt-1 text-[11px] text-gray-400 dark:text-gray-500"
          data-testid="fitness-fn-legend"
        >
          F/N = Fetched / Normalized
        </p>
      </details>
    </article>
  </section>
</template>
