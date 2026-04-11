<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import BaseModal from './BaseModal.vue'
import { useJobsStore } from '@/stores/jobs'
import type { Job } from '@/types/job'

/**
 * Wraps BaseModal with a small configure → running → done | error
 * state machine that drives one of two batch job kinds (entity
 * extraction or mood backfill). The modal owns no polling itself;
 * it asks the jobs store to start a job and then watches the
 * store-held Job by id for terminal transitions. Closing the
 * modal while a job is in flight does NOT stop polling — the
 * store keeps the job live in the background.
 */

type JobKind = 'entity_extraction' | 'mood_backfill'
type Mode = 'stale-only' | 'force'
type Stage = 'configure' | 'running' | 'done' | 'error'

interface Props {
  modelValue: boolean
  title: string
  jobKind: JobKind
}

const props = defineProps<Props>()
const emit = defineEmits<{
  (e: 'update:modelValue', value: boolean): void
  (e: 'job-succeeded'): void
}>()

const jobsStore = useJobsStore()

const stage = ref<Stage>('configure')
const mode = ref<Mode>('stale-only')
const startDate = ref<string>('')
const endDate = ref<string>('')
const jobId = ref<string | null>(null)
const errorMessage = ref<string>('')
// True between clicking Run and the submission returning. Guards
// against a double-click or a second click during a slow network
// submitting two jobs behind the user's back.
const submitting = ref<boolean>(false)

// Follow the live store-held Job by id so progress + terminal
// transitions flow through a single computed the watcher below
// depends on. The placeholder written by the store is what we
// see between the `Run` click and the first successful poll.
const currentJob = computed<Job | undefined>(() =>
  jobId.value ? jobsStore.getJobById(jobId.value) : undefined,
)

function resetState(): void {
  stage.value = 'configure'
  mode.value = 'stale-only'
  startDate.value = ''
  endDate.value = ''
  jobId.value = null
  errorMessage.value = ''
  submitting.value = false
}

// Reset to configure every time the modal reopens. The in-flight
// job keeps polling inside the jobs store regardless of this
// component's lifetime, but a fresh open always starts at
// configure — it does not resume the progress view of an earlier
// run. Restoring mid-stream progress is a follow-up item.
watch(
  () => props.modelValue,
  (open, prev) => {
    if (open && !prev) {
      resetState()
    }
  },
)

// React to terminal transitions on the job we spawned. The
// placeholder starts at `queued`; we only flip to `done` or
// `error` once the server-side status is observed.
watch(currentJob, (job) => {
  if (!job || stage.value !== 'running') return
  if (job.status === 'succeeded') {
    emit('job-succeeded')
    stage.value = 'done'
  } else if (job.status === 'failed') {
    errorMessage.value = job.error_message || 'Job failed'
    stage.value = 'error'
  }
})

function close(): void {
  emit('update:modelValue', false)
}

async function onRun(): Promise<void> {
  // Guard against double-click during the submission round-trip.
  if (submitting.value) return
  submitting.value = true
  errorMessage.value = ''
  try {
    const common: { start_date?: string; end_date?: string } = {}
    if (startDate.value) common.start_date = startDate.value
    if (endDate.value) common.end_date = endDate.value

    let id: string
    if (props.jobKind === 'entity_extraction') {
      id = await jobsStore.startEntityExtraction({
        stale_only: mode.value === 'stale-only',
        ...common,
      })
    } else {
      id = await jobsStore.startMoodBackfill({
        mode: mode.value,
        ...common,
      })
    }
    jobId.value = id
    stage.value = 'running'
  } catch (err) {
    errorMessage.value = err instanceof Error ? err.message : String(err)
    stage.value = 'error'
  } finally {
    submitting.value = false
  }
}

function onCloseDone(): void {
  if (jobId.value) {
    jobsStore.clearJob(jobId.value)
  }
  close()
}

function onCloseError(): void {
  if (jobId.value) {
    jobsStore.clearJob(jobId.value)
  }
  close()
}

const progressPercent = computed<number>(() => {
  const job = currentJob.value
  if (!job || job.progress_total <= 0) return 0
  return Math.min(
    100,
    Math.max(0, (job.progress_current / job.progress_total) * 100),
  )
})

const isIndeterminate = computed<boolean>(() => {
  const job = currentJob.value
  return !job || job.progress_total <= 0
})

// The helper copy depends on both the job kind and the selected
// mode. Kept as a pair of small getters rather than a ternary in
// the template so the strings are easy to tweak.
const staleHelper = computed<string>(() => {
  if (props.jobKind === 'entity_extraction') {
    return "Entries that haven't been extracted or whose text changed."
  }
  return 'Entries missing at least one current mood dimension.'
})

const forceHelper = computed<string>(() => {
  if (props.jobKind === 'entity_extraction') {
    return 'Re-run extraction on every entry in the date range.'
  }
  return 'Re-score every entry in the date range.'
})

// Extraction / backfill result shape is a free-form dict on the
// wire; narrow to a typed record here so the template can read
// fields without a cast on every access.
interface EntityResultSummary {
  processed?: number
  entities_created?: number
  entities_matched?: number
  mentions_created?: number
  relationships_created?: number
  warnings?: unknown[]
}

interface MoodResultSummary {
  scored?: number
  skipped?: number
  errors?: unknown[]
}

const entityResult = computed<EntityResultSummary | null>(() => {
  const job = currentJob.value
  if (!job || props.jobKind !== 'entity_extraction' || !job.result) return null
  return job.result as EntityResultSummary
})

const moodResult = computed<MoodResultSummary | null>(() => {
  const job = currentJob.value
  if (!job || props.jobKind !== 'mood_backfill' || !job.result) return null
  return job.result as MoodResultSummary
})
</script>

<template>
  <BaseModal
    :model-value="modelValue"
    :title="title"
    size="md"
    @update:model-value="(v) => emit('update:modelValue', v)"
  >
    <!-- configure -->
    <div
      v-if="stage === 'configure'"
      data-testid="batch-modal-configure"
      class="space-y-4"
    >
      <fieldset class="space-y-2">
        <legend
          class="text-xs uppercase text-gray-400 dark:text-gray-500 font-semibold mb-1"
        >
          Scope
        </legend>
        <label class="flex items-start gap-2 cursor-pointer">
          <input
            v-model="mode"
            type="radio"
            value="stale-only"
            class="form-radio mt-0.5 text-violet-500"
            data-testid="batch-modal-mode-stale"
          />
          <span class="text-sm">
            <span class="font-medium text-gray-800 dark:text-gray-100">
              New entries only
            </span>
            <span class="block text-xs text-gray-500 dark:text-gray-400">
              {{ staleHelper }}
            </span>
          </span>
        </label>
        <label class="flex items-start gap-2 cursor-pointer">
          <input
            v-model="mode"
            type="radio"
            value="force"
            class="form-radio mt-0.5 text-violet-500"
            data-testid="batch-modal-mode-force"
          />
          <span class="text-sm">
            <span class="font-medium text-gray-800 dark:text-gray-100">
              Re-extract all
            </span>
            <span class="block text-xs text-gray-500 dark:text-gray-400">
              {{ forceHelper }}
            </span>
          </span>
        </label>
      </fieldset>

      <div class="grid grid-cols-2 gap-3">
        <div>
          <label
            for="batch-modal-start-date"
            class="block text-xs uppercase text-gray-400 dark:text-gray-500 font-semibold mb-1"
          >
            Start date
          </label>
          <input
            id="batch-modal-start-date"
            v-model="startDate"
            type="date"
            class="form-input w-full text-sm bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700/60 rounded-md"
            data-testid="batch-modal-start-date"
          />
        </div>
        <div>
          <label
            for="batch-modal-end-date"
            class="block text-xs uppercase text-gray-400 dark:text-gray-500 font-semibold mb-1"
          >
            End date
          </label>
          <input
            id="batch-modal-end-date"
            v-model="endDate"
            type="date"
            class="form-input w-full text-sm bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700/60 rounded-md"
            data-testid="batch-modal-end-date"
          />
        </div>
      </div>
      <p class="text-xs text-gray-400 dark:text-gray-500">
        Date range is optional — leave both blank to cover every entry.
      </p>
    </div>

    <!-- running -->
    <div
      v-else-if="stage === 'running'"
      data-testid="batch-modal-running"
      class="space-y-3"
    >
      <div class="text-sm text-gray-700 dark:text-gray-200">
        <span class="font-medium">{{ title }}</span>
        <span class="text-gray-500 dark:text-gray-400">
          — {{ mode === 'stale-only' ? 'new only' : 'force all' }}
        </span>
      </div>
      <div
        class="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2 overflow-hidden"
        data-testid="batch-modal-progress-bar"
      >
        <div
          v-if="!isIndeterminate"
          class="bg-violet-500 h-2 transition-all"
          :style="{ width: `${progressPercent}%` }"
        />
        <div v-else class="bg-violet-500/60 h-2 w-1/3 animate-pulse" />
      </div>
      <div
        class="flex items-center justify-between text-xs text-gray-500 dark:text-gray-400"
      >
        <span data-testid="batch-modal-progress-counter">
          {{ currentJob?.progress_current ?? 0 }} /
          {{ currentJob?.progress_total ?? 0 }}
        </span>
        <span class="capitalize">{{ currentJob?.status ?? 'queued' }}</span>
      </div>
      <p class="text-xs text-gray-400 dark:text-gray-500">
        Closing this window will not cancel the job — it will continue running
        in the background.
      </p>
    </div>

    <!-- done -->
    <div
      v-else-if="stage === 'done'"
      data-testid="batch-modal-done"
      class="space-y-3"
    >
      <p class="text-sm font-medium text-gray-800 dark:text-gray-100">
        Job completed successfully.
      </p>
      <dl
        v-if="entityResult"
        class="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-gray-600 dark:text-gray-300"
        data-testid="batch-modal-entity-result"
      >
        <dt class="text-gray-400 dark:text-gray-500">Processed</dt>
        <dd class="font-mono">{{ entityResult.processed ?? 0 }}</dd>
        <dt class="text-gray-400 dark:text-gray-500">Entities created</dt>
        <dd class="font-mono">{{ entityResult.entities_created ?? 0 }}</dd>
        <dt class="text-gray-400 dark:text-gray-500">Entities matched</dt>
        <dd class="font-mono">{{ entityResult.entities_matched ?? 0 }}</dd>
        <dt class="text-gray-400 dark:text-gray-500">Mentions created</dt>
        <dd class="font-mono">{{ entityResult.mentions_created ?? 0 }}</dd>
        <dt class="text-gray-400 dark:text-gray-500">Relationships created</dt>
        <dd class="font-mono">{{ entityResult.relationships_created ?? 0 }}</dd>
        <dt class="text-gray-400 dark:text-gray-500">Warnings</dt>
        <dd class="font-mono">{{ entityResult.warnings?.length ?? 0 }}</dd>
      </dl>
      <dl
        v-else-if="moodResult"
        class="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-gray-600 dark:text-gray-300"
        data-testid="batch-modal-mood-result"
      >
        <dt class="text-gray-400 dark:text-gray-500">Scored</dt>
        <dd class="font-mono">{{ moodResult.scored ?? 0 }}</dd>
        <dt class="text-gray-400 dark:text-gray-500">Skipped</dt>
        <dd class="font-mono">{{ moodResult.skipped ?? 0 }}</dd>
        <dt class="text-gray-400 dark:text-gray-500">Errors</dt>
        <dd class="font-mono">{{ moodResult.errors?.length ?? 0 }}</dd>
      </dl>
    </div>

    <!-- error -->
    <div
      v-else-if="stage === 'error'"
      data-testid="batch-modal-error"
      class="space-y-3"
    >
      <div
        class="bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 border border-red-200 dark:border-red-800/40 rounded-lg px-4 py-3 text-sm"
      >
        {{ errorMessage || 'Something went wrong.' }}
      </div>
    </div>

    <template #footer>
      <template v-if="stage === 'configure'">
        <button
          type="button"
          class="btn bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700/60 text-gray-600 dark:text-gray-300"
          data-testid="batch-modal-cancel"
          @click="close"
        >
          Cancel
        </button>
        <button
          type="button"
          class="btn bg-violet-500 hover:bg-violet-600 text-white disabled:opacity-50 disabled:cursor-not-allowed"
          data-testid="batch-modal-run"
          :disabled="submitting"
          @click="onRun"
        >
          {{ submitting ? 'Submitting…' : 'Run' }}
        </button>
      </template>
      <template v-else-if="stage === 'running'">
        <button
          type="button"
          class="btn bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700/60 text-gray-600 dark:text-gray-300"
          data-testid="batch-modal-close-running"
          @click="close"
        >
          Close
        </button>
      </template>
      <template v-else-if="stage === 'done'">
        <button
          type="button"
          class="btn bg-violet-500 hover:bg-violet-600 text-white"
          data-testid="batch-modal-close-done"
          @click="onCloseDone"
        >
          Close
        </button>
      </template>
      <template v-else-if="stage === 'error'">
        <button
          type="button"
          class="btn bg-violet-500 hover:bg-violet-600 text-white"
          data-testid="batch-modal-close-error"
          @click="onCloseError"
        >
          Close
        </button>
      </template>
    </template>
  </BaseModal>
</template>
