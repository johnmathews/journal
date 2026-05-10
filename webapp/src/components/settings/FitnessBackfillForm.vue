<script setup lang="ts">
import { ref } from 'vue'
import { RouterLink } from 'vue-router'
import { triggerBackfill } from '@/api/fitness'
import { useJobsStore } from '@/stores/jobs'
import { ApiRequestError } from '@/api/client'
import type { FitnessSource } from '@/types/fitness'

const props = defineProps<{
  source: FitnessSource
}>()

// Default `start` matches the historical-data sweep window agreed for
// W5 (see fitness-multiuser-plan §5 W9). End is optional — the server
// defaults to today (UTC) when omitted.
const start = ref('2026-01-01')
const end = ref('')

const submitting = ref(false)
const result = ref<{
  jobId: string
  alreadyRunning: boolean
} | null>(null)
const error = ref<string | null>(null)

async function submit(): Promise<void> {
  submitting.value = true
  result.value = null
  error.value = null
  try {
    const body: { start: string; end?: string } = { start: start.value }
    if (end.value) body.end = end.value
    const resp = await triggerBackfill(props.source, body)
    result.value = {
      jobId: resp.job_id,
      alreadyRunning: resp.already_running ?? false,
    }
    // Register with the jobs store so the notifications panel tracks it
    // like any other background job. Backfill workers reuse the same
    // job kind as sync — keep the `source` tag for filtering.
    const jobsStore = useJobsStore()
    const jobType =
      props.source === 'strava' ? 'fitness_sync_strava' : 'fitness_sync_garmin'
    jobsStore.trackJob(resp.job_id, jobType, { source: props.source })
  } catch (e) {
    if (e instanceof ApiRequestError) {
      error.value = e.message
    } else if (e instanceof Error) {
      error.value = e.message
    } else {
      error.value = 'Failed to queue backfill'
    }
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <div
    class="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700/60"
    :data-testid="`backfill-form-${source}`"
  >
    <p class="text-xs font-medium text-gray-700 dark:text-gray-300 mb-2">
      Historical backfill
    </p>
    <p class="text-xs text-gray-600 dark:text-gray-300 mb-3">
      Pull historical activities into the local store. End date defaults to
      today when left blank.
    </p>
    <div class="flex flex-wrap items-end gap-3">
      <label class="flex flex-col text-xs text-gray-700 dark:text-gray-300">
        <span class="mb-1">Start</span>
        <input
          v-model="start"
          type="date"
          class="form-input text-sm py-1 px-2 w-40"
          :data-testid="`backfill-${source}-start`"
        />
      </label>
      <label class="flex flex-col text-xs text-gray-700 dark:text-gray-300">
        <span class="mb-1">End (optional)</span>
        <input
          v-model="end"
          type="date"
          class="form-input text-sm py-1 px-2 w-40"
          :data-testid="`backfill-${source}-end`"
        />
      </label>
      <button
        type="button"
        class="btn-sm bg-violet-500 hover:bg-violet-600 text-white disabled:opacity-50"
        :disabled="submitting || !start"
        :data-testid="`backfill-${source}-submit`"
        @click="submit"
      >
        {{ submitting ? 'Queueing…' : 'Run backfill' }}
      </button>
    </div>
    <p
      v-if="result"
      class="mt-3 text-xs text-emerald-700 dark:text-emerald-300"
      :data-testid="`backfill-${source}-result`"
    >
      <template v-if="result.alreadyRunning">
        Already running — joined job
      </template>
      <template v-else> Backfill queued </template>
      (<RouterLink
        :to="{ name: 'job-history' }"
        class="underline hover:text-emerald-800 dark:hover:text-emerald-200"
        :data-testid="`backfill-${source}-job-link`"
        >{{ result.jobId }}</RouterLink
      >).
    </p>
    <p
      v-if="error"
      class="mt-3 text-xs text-rose-700 dark:text-rose-300"
      :data-testid="`backfill-${source}-error`"
    >
      {{ error }}
    </p>
  </div>
</template>
