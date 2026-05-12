<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import BaseModal from './BaseModal.vue'
import { useStorylinesStore } from '@/stores/storylines'
import { useJobsStore } from '@/stores/jobs'
import { useToast } from '@/composables/useToast'

/**
 * Storyline regenerate modal. Drives the optional regenerate body
 * (date range + mode) for one storyline (per-row use) or many
 * (selection-toolbar use). One submit enqueues one server job per
 * storyline id; each job id is handed off to the jobs store so the
 * notification bell tracks generation progress.
 *
 * Mode `append` is only valid when `start_date` is set (server also
 * validates `start_date >= last_generated_at` and returns 400 on
 * violation; we surface that via the per-id error list).
 */

const props = defineProps<{
  modelValue: boolean
  storylineIds: number[]
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', value: boolean): void
  (e: 'submitted', payload: { jobIds: string[] }): void
}>()

const store = useStorylinesStore()
const jobsStore = useJobsStore()
const toast = useToast()

type Mode = 'replace' | 'append'

const mode = ref<Mode>('replace')
const startDate = ref('')
const endDate = ref('')
const submitting = ref(false)
// Per-storyline errors collected during a bulk submit, so a partial
// failure doesn't silently swallow the bad ones.
const submitErrors = ref<{ id: number; message: string }[]>([])

function resetState(): void {
  mode.value = 'replace'
  startDate.value = ''
  endDate.value = ''
  submitting.value = false
  submitErrors.value = []
}

watch(
  () => props.modelValue,
  (open, prev) => {
    if (open && !prev) {
      resetState()
    }
  },
)

const affectedCount = computed<number>(() => props.storylineIds.length)

const appendNeedsStart = computed<boolean>(
  () => mode.value === 'append' && !startDate.value,
)

const canSubmit = computed<boolean>(() => {
  if (submitting.value) return false
  if (affectedCount.value === 0) return false
  if (appendNeedsStart.value) return false
  return true
})

async function onSubmit(): Promise<void> {
  if (!canSubmit.value) return
  submitting.value = true
  submitErrors.value = []
  const jobIds: string[] = []
  const body: { start_date?: string; end_date?: string; mode?: Mode } = {
    mode: mode.value,
  }
  if (startDate.value) body.start_date = startDate.value
  if (endDate.value) body.end_date = endDate.value

  try {
    for (const id of props.storylineIds) {
      try {
        const resp = await store.regenerate(id, body)
        jobIds.push(resp.job_id)
        jobsStore.trackJob(resp.job_id, 'storyline_generation', {
          storyline_id: id,
        })
      } catch (e) {
        submitErrors.value.push({
          id,
          message: e instanceof Error ? e.message : 'Failed',
        })
      }
    }

    if (jobIds.length > 0) {
      const verb =
        jobIds.length === 1
          ? 'Queued regeneration.'
          : `Queued ${jobIds.length} regenerations.`
      toast.success(verb)
      emit('submitted', { jobIds })
    }

    if (submitErrors.value.length === 0) {
      emit('update:modelValue', false)
    } else if (jobIds.length === 0) {
      toast.error('Regeneration failed.')
    } else {
      toast.error(
        `Queued ${jobIds.length} of ${props.storylineIds.length}; ${submitErrors.value.length} failed.`,
      )
    }
  } finally {
    submitting.value = false
  }
}

function onCancel(): void {
  emit('update:modelValue', false)
}
</script>

<template>
  <BaseModal
    :model-value="modelValue"
    title="Regenerate storyline"
    size="md"
    @update:model-value="(v) => emit('update:modelValue', v)"
  >
    <div class="space-y-4" data-testid="storyline-regenerate-modal">
      <p
        v-if="affectedCount > 0"
        class="text-xs text-gray-600 dark:text-gray-300"
        data-testid="storyline-regenerate-count"
      >
        Regenerating {{ affectedCount }} storyline{{
          affectedCount === 1 ? '' : 's'
        }}.
      </p>

      <fieldset class="space-y-2">
        <legend
          class="text-xs uppercase text-gray-600 dark:text-gray-300 font-semibold mb-1"
        >
          Mode
        </legend>
        <label class="flex items-start gap-2 cursor-pointer">
          <input
            v-model="mode"
            type="radio"
            value="replace"
            class="form-radio mt-0.5 text-violet-500"
            data-testid="storyline-regenerate-mode-replace"
          />
          <span class="text-sm">
            <span class="font-medium text-gray-800 dark:text-gray-100">
              Replace
            </span>
            <span class="block text-xs text-gray-600 dark:text-gray-300">
              Regenerate both panels from scratch using the date range (or the
              storyline's saved range if blank).
            </span>
          </span>
        </label>
        <label class="flex items-start gap-2 cursor-pointer">
          <input
            v-model="mode"
            type="radio"
            value="append"
            class="form-radio mt-0.5 text-violet-500"
            data-testid="storyline-regenerate-mode-append"
          />
          <span class="text-sm">
            <span class="font-medium text-gray-800 dark:text-gray-100">
              Append / Update
            </span>
            <span class="block text-xs text-gray-600 dark:text-gray-300">
              Process entries in this date range and append them to the existing
              storyline. Range must start on or after the storyline's last
              generation date.
            </span>
          </span>
        </label>
      </fieldset>

      <div class="grid grid-cols-2 gap-3">
        <div>
          <label
            for="storyline-regenerate-start"
            class="block text-xs uppercase text-gray-600 dark:text-gray-300 font-semibold mb-1"
          >
            Start date
          </label>
          <input
            id="storyline-regenerate-start"
            v-model="startDate"
            type="date"
            class="form-input w-full text-sm bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700/60 rounded-md"
            data-testid="storyline-regenerate-start-date"
          />
        </div>
        <div>
          <label
            for="storyline-regenerate-end"
            class="block text-xs uppercase text-gray-600 dark:text-gray-300 font-semibold mb-1"
          >
            End date
          </label>
          <input
            id="storyline-regenerate-end"
            v-model="endDate"
            type="date"
            class="form-input w-full text-sm bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700/60 rounded-md"
            data-testid="storyline-regenerate-end-date"
          />
        </div>
      </div>

      <p
        v-if="appendNeedsStart"
        class="text-xs text-red-600 dark:text-red-400"
        data-testid="storyline-regenerate-append-warning"
      >
        Append mode requires a start date.
      </p>

      <div
        v-if="submitErrors.length > 0"
        class="bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 border border-red-200 dark:border-red-800/40 rounded-lg px-3 py-2 text-xs space-y-1"
        data-testid="storyline-regenerate-errors"
      >
        <p class="font-medium">Some regenerations failed:</p>
        <ul class="list-disc list-inside">
          <li v-for="err in submitErrors" :key="err.id">
            #{{ err.id }} — {{ err.message }}
          </li>
        </ul>
      </div>
    </div>

    <template #footer>
      <button
        type="button"
        class="btn bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700/60 text-gray-600 dark:text-gray-300"
        data-testid="storyline-regenerate-cancel"
        @click="onCancel"
      >
        Cancel
      </button>
      <button
        type="button"
        class="btn bg-violet-500 hover:bg-violet-600 text-white disabled:opacity-50 disabled:cursor-not-allowed"
        :disabled="!canSubmit"
        data-testid="storyline-regenerate-submit"
        @click="onSubmit"
      >
        {{ submitting ? 'Submitting…' : 'Regenerate' }}
      </button>
    </template>
  </BaseModal>
</template>
