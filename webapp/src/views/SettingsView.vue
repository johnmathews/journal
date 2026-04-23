<script setup lang="ts">
import { onMounted, computed, ref } from 'vue'
import { useSettingsStore } from '@/stores/settings'
import { useAuthStore } from '@/stores/auth'
import { useJobsStore } from '@/stores/jobs'
import { useDashboardStore } from '@/stores/dashboard'
import { useToast } from '@/composables/useToast'
import { triggerEntityExtraction } from '@/api/entities'
import BatchJobModal from '@/components/BatchJobModal.vue'
import NotificationsSettings from '@/components/NotificationsSettings.vue'
import {
  ocrCostPer1000Words,
  audioCostPer1000Words,
  chunkingCostPerEntry,
  moodScoringCostPerEntry,
  entityExtractionCostPerEntry,
  formatCost,
} from '@/utils/cost-estimates'

const store = useSettingsStore()
const authStore = useAuthStore()
const jobsStore = useJobsStore()
const toast = useToast()

async function toggleRuntimeSetting(key: string, value: boolean | string) {
  try {
    await store.updateRuntime({ [key]: value })
    toast.success('Setting updated')
  } catch {
    toast.error('Failed to update setting')
  }
}

const editingName = ref(false)
const nameInput = ref('')
const nameSaving = ref(false)
const nameError = ref<string | null>(null)
const showReextractPrompt = ref(false)
const reextractSubmitting = ref(false)

function startEditingName() {
  nameInput.value = authStore.displayName
  nameError.value = null
  editingName.value = true
}

function cancelEditingName() {
  editingName.value = false
  nameError.value = null
}

async function saveDisplayName() {
  const trimmed = nameInput.value.trim()
  if (!trimmed) {
    nameError.value = 'Name cannot be empty'
    return
  }
  if (trimmed === authStore.displayName) {
    editingName.value = false
    return
  }
  nameSaving.value = true
  nameError.value = null
  try {
    await authStore.updateDisplayName(trimmed)
    editingName.value = false
    showReextractPrompt.value = true
  } catch {
    nameError.value = 'Failed to update name'
  } finally {
    nameSaving.value = false
  }
}

async function triggerReextraction() {
  reextractSubmitting.value = true
  try {
    const resp = await triggerEntityExtraction({ stale_only: false })
    jobsStore.trackJob(resp.job_id, 'entity_extraction', {})
    showReextractPrompt.value = false
  } catch {
    // Prompt stays open so user can retry
  } finally {
    reextractSubmitting.value = false
  }
}

function dismissReextractPrompt() {
  showReextractPrompt.value = false
}

onMounted(() => {
  store.load()
})

function formatUptime(seconds: number): string {
  const d = Math.floor(seconds / 86400)
  const h = Math.floor((seconds % 86400) / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  if (d > 0) return `${d}d ${h}h ${m}m`
  if (h > 0) return `${h}h ${m}m`
  return `${m}m`
}

const overallStatus = computed(() => store.health?.status ?? 'unknown')

const statusColor = computed(() => {
  switch (overallStatus.value) {
    case 'ok':
      return 'text-emerald-600 dark:text-emerald-400'
    case 'degraded':
      return 'text-amber-600 dark:text-amber-400'
    default:
      return 'text-red-600 dark:text-red-400'
  }
})

const chunkingCost = computed(() => {
  if (!store.settings) return null
  return chunkingCostPerEntry(store.settings.embedding.model)
})

const moodCost = computed(() => {
  if (!store.settings) return null
  return moodScoringCostPerEntry(store.settings.features.mood_scorer_model)
})

const entityCost = computed(() => {
  if (!store.settings) return null
  return entityExtractionCostPerEntry(
    store.settings.entity_extraction.model,
    store.settings.embedding.model,
  )
})

const ocrCostPerK = computed(() => {
  if (!store.settings) return null
  return ocrCostPer1000Words(store.settings.ocr.model)
})

const audioCostPerK = computed(() => {
  if (!store.settings) return null
  const formattingEnabled =
    (store.settings.runtime.find((s) => s.key === 'transcript_formatting')
      ?.value as boolean) ?? false
  return audioCostPer1000Words(
    store.settings.transcription.model,
    formattingEnabled,
    formattingEnabled ? store.settings.transcript_formatting.model : null,
  )
})

function runtimeSettingValue(key: string): boolean | string | undefined {
  return store.settings?.runtime.find((s) => s.key === key)?.value
}

const showMoodBackfillModal = ref(false)
const showEntityExtractionModal = ref(false)

const dashboardStore = useDashboardStore()

async function onMoodJobSucceeded(): Promise<void> {
  await dashboardStore.loadMoodTrends()
}

const moodScoringEnabled = computed(
  () => store.settings?.features.mood_scoring ?? false,
)
</script>

<template>
  <main class="px-4 sm:px-6 lg:px-8 py-8 w-full max-w-5xl mx-auto">
    <h1
      class="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-6"
      data-testid="settings-heading"
    >
      Settings & Health
    </h1>

    <!-- Loading -->
    <div
      v-if="store.loading"
      class="text-gray-500 dark:text-gray-400"
      data-testid="settings-loading"
    >
      Loading...
    </div>

    <!-- Error -->
    <div
      v-else-if="store.error"
      class="rounded-lg bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-700/60 p-4 text-red-800 dark:text-red-200"
      data-testid="settings-error"
    >
      {{ store.error }}
    </div>

    <template v-else>
      <!-- Health Section -->
      <section v-if="store.health" class="mb-8" data-testid="health-section">
        <h2 class="text-lg font-semibold text-gray-800 dark:text-gray-200 mb-4">
          Health
        </h2>

        <!-- Overall status + uptime -->
        <div
          class="flex items-center gap-4 mb-4 p-4 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700/60 rounded-xl shadow-xs"
        >
          <div>
            <span class="text-sm text-gray-500 dark:text-gray-400">Status</span>
            <p
              class="text-lg font-bold uppercase"
              :class="statusColor"
              data-testid="health-status"
            >
              {{ overallStatus }}
            </p>
          </div>
          <div class="h-8 w-px bg-gray-200 dark:bg-gray-700" />
          <div>
            <span class="text-sm text-gray-500 dark:text-gray-400">Uptime</span>
            <p
              class="text-lg font-semibold text-gray-900 dark:text-gray-100"
              data-testid="health-uptime"
            >
              {{ formatUptime(store.health.queries.uptime_seconds) }}
            </p>
          </div>
          <div class="h-8 w-px bg-gray-200 dark:bg-gray-700" />
          <div>
            <span class="text-sm text-gray-500 dark:text-gray-400"
              >Entries</span
            >
            <p class="text-lg font-semibold text-gray-900 dark:text-gray-100">
              {{ store.health.ingestion.total_entries.toLocaleString() }}
            </p>
          </div>
          <div class="h-8 w-px bg-gray-200 dark:bg-gray-700" />
          <div>
            <span class="text-sm text-gray-500 dark:text-gray-400">Chunks</span>
            <p class="text-lg font-semibold text-gray-900 dark:text-gray-100">
              {{ store.health.ingestion.total_chunks.toLocaleString() }}
            </p>
          </div>
        </div>

        <!-- Component checks -->
        <div
          class="grid grid-cols-2 sm:grid-cols-4 gap-3"
          data-testid="health-checks"
        >
          <div
            v-for="check in store.health.checks"
            :key="check.name"
            class="p-3 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700/60 rounded-lg shadow-xs"
          >
            <p
              class="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1"
            >
              {{ check.name }}
            </p>
            <p
              class="text-sm font-semibold"
              :class="
                check.status === 'ok'
                  ? 'text-emerald-600 dark:text-emerald-400'
                  : check.status === 'degraded'
                    ? 'text-amber-600 dark:text-amber-400'
                    : 'text-red-600 dark:text-red-400'
              "
            >
              {{ check.status }}
            </p>
            <p
              v-if="check.detail && check.status !== 'ok'"
              class="text-xs text-gray-500 dark:text-gray-400 mt-1 truncate"
              :title="check.detail"
            >
              {{ check.detail }}
            </p>
          </div>
        </div>

        <!-- Ingestion stats -->
        <div
          class="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-3"
          data-testid="ingestion-stats"
        >
          <div
            class="p-3 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700/60 rounded-lg shadow-xs"
          >
            <p
              class="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1"
            >
              Last 7 days
            </p>
            <p class="text-lg font-semibold text-gray-900 dark:text-gray-100">
              {{ store.health.ingestion.entries_last_7d }} entries
            </p>
          </div>
          <div
            class="p-3 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700/60 rounded-lg shadow-xs"
          >
            <p
              class="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1"
            >
              Last 30 days
            </p>
            <p class="text-lg font-semibold text-gray-900 dark:text-gray-100">
              {{ store.health.ingestion.entries_last_30d }} entries
            </p>
          </div>
          <div
            class="p-3 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700/60 rounded-lg shadow-xs"
          >
            <p
              class="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1"
            >
              Avg words/entry
            </p>
            <p class="text-lg font-semibold text-gray-900 dark:text-gray-100">
              {{ Math.round(store.health.ingestion.avg_words_per_entry) }}
            </p>
          </div>
          <div
            class="p-3 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700/60 rounded-lg shadow-xs"
          >
            <p
              class="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1"
            >
              Avg chunks/entry
            </p>
            <p class="text-lg font-semibold text-gray-900 dark:text-gray-100">
              {{ store.health.ingestion.avg_chunks_per_entry.toFixed(1) }}
            </p>
          </div>
        </div>
      </section>

      <!-- Runtime Settings -->
      <section
        v-if="store.settings?.runtime?.length"
        data-testid="runtime-settings-section"
      >
        <h2 class="text-lg font-semibold text-gray-800 dark:text-gray-200 mb-4">
          Runtime Settings
        </h2>
        <div
          class="p-4 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700/60 rounded-xl shadow-xs space-y-4"
        >
          <div
            v-for="setting in store.settings.runtime.filter(
              (s) => s.key !== 'transcript_formatting',
            )"
            :key="setting.key"
            class="flex items-center justify-between"
            :data-testid="`runtime-${setting.key}`"
          >
            <div class="flex-1 min-w-0 mr-4">
              <p class="text-sm font-medium text-gray-700 dark:text-gray-300">
                {{ setting.label }}
              </p>
              <p class="text-xs text-gray-400 dark:text-gray-500">
                {{ setting.description }}
              </p>
            </div>

            <!-- Boolean toggle -->
            <button
              v-if="setting.type === 'bool'"
              type="button"
              :class="[
                'relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-violet-500 focus:ring-offset-2 dark:focus:ring-offset-gray-900',
                setting.value
                  ? 'bg-violet-500'
                  : 'bg-gray-200 dark:bg-gray-600',
              ]"
              role="switch"
              :aria-checked="!!setting.value"
              :disabled="store.updating"
              :data-testid="`toggle-${setting.key}`"
              @click="toggleRuntimeSetting(setting.key, !setting.value)"
            >
              <span
                :class="[
                  'pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out',
                  setting.value ? 'translate-x-5' : 'translate-x-0',
                ]"
              />
            </button>

            <!-- String select -->
            <select
              v-else-if="setting.type === 'string' && setting.choices"
              :value="setting.value"
              class="form-select text-sm py-1 px-2 rounded-lg border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200"
              :disabled="store.updating"
              :data-testid="`select-${setting.key}`"
              @change="
                toggleRuntimeSetting(
                  setting.key,
                  ($event.target as HTMLSelectElement).value,
                )
              "
            >
              <option
                v-for="choice in setting.choices"
                :key="choice"
                :value="choice"
              >
                {{ choice }}
              </option>
            </select>
          </div>
        </div>
      </section>

      <!-- Background Jobs -->
      <section class="mb-8 mt-8" data-testid="background-jobs-section">
        <h2 class="text-lg font-semibold text-gray-800 dark:text-gray-200 mb-4">
          Background Jobs
        </h2>
        <div class="space-y-4">
          <!-- Mood Backfill -->
          <div
            class="p-4 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700/60 rounded-xl shadow-xs"
            data-testid="job-mood-backfill"
          >
            <div class="flex items-center justify-between">
              <div class="flex-1 min-w-0 mr-4">
                <p class="text-sm font-medium text-gray-700 dark:text-gray-300">
                  Mood Backfill
                </p>
                <p class="text-xs text-gray-400 dark:text-gray-500">
                  Score entries for mood dimensions. Run on new entries or
                  re-score existing ones.
                </p>
              </div>
              <button
                type="button"
                class="btn-sm bg-violet-500 hover:bg-violet-600 text-white"
                :disabled="!moodScoringEnabled"
                :title="
                  moodScoringEnabled
                    ? 'Run mood backfill'
                    : 'Mood scoring is disabled'
                "
                data-testid="run-mood-backfill-button"
                @click="showMoodBackfillModal = true"
              >
                Run
              </button>
            </div>
          </div>

          <!-- Entity Extraction -->
          <div
            class="p-4 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700/60 rounded-xl shadow-xs"
            data-testid="job-entity-extraction"
          >
            <div class="flex items-center justify-between">
              <div class="flex-1 min-w-0 mr-4">
                <p class="text-sm font-medium text-gray-700 dark:text-gray-300">
                  Entity Extraction
                </p>
                <p class="text-xs text-gray-400 dark:text-gray-500">
                  Extract people, places, and other entities from entries.
                </p>
              </div>
              <button
                type="button"
                class="btn-sm bg-violet-500 hover:bg-violet-600 text-white"
                data-testid="run-entity-extraction-button"
                @click="showEntityExtractionModal = true"
              >
                Run
              </button>
            </div>
          </div>
        </div>
      </section>

      <BatchJobModal
        v-model="showMoodBackfillModal"
        title="Run mood backfill"
        job-kind="mood_backfill"
        @job-succeeded="onMoodJobSucceeded"
      />
      <BatchJobModal
        v-model="showEntityExtractionModal"
        title="Run entity extraction"
        job-kind="entity_extraction"
      />

      <!-- Notifications -->
      <NotificationsSettings />

      <!-- Settings Section -->
      <section v-if="store.settings" data-testid="settings-section">
        <h2 class="text-lg font-semibold text-gray-800 dark:text-gray-200 mb-4">
          Processing Pipeline
        </h2>

        <div class="space-y-4">
          <!-- 1a. OCR Ingestion -->
          <div
            class="p-4 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700/60 rounded-xl shadow-xs"
            data-testid="section-ocr-ingestion"
          >
            <div class="flex items-center justify-between mb-3">
              <h3
                class="text-sm font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider"
              >
                1a. OCR Ingestion
              </h3>
              <span
                class="text-xs font-medium text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/30 px-2 py-0.5 rounded-full"
                data-testid="ocr-ingestion-cost"
              >
                {{ formatCost(ocrCostPerK) }}/1k words
              </span>
            </div>
            <dl class="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 text-sm">
              <div class="flex justify-between sm:block">
                <dt class="text-gray-500 dark:text-gray-400">OCR Provider</dt>
                <dd
                  class="font-medium text-gray-900 dark:text-gray-100"
                  data-testid="ocr-provider"
                >
                  {{ store.settings.ocr.provider }}
                </dd>
              </div>
              <div class="flex justify-between sm:block">
                <dt class="text-gray-500 dark:text-gray-400">OCR Model</dt>
                <dd
                  class="font-medium text-gray-900 dark:text-gray-100"
                  data-testid="ocr-model"
                >
                  {{ store.settings.ocr.model }}
                </dd>
              </div>
            </dl>
          </div>

          <!-- 1b. Audio Ingestion -->
          <div
            class="p-4 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700/60 rounded-xl shadow-xs"
            data-testid="section-audio-ingestion"
          >
            <div class="flex items-center justify-between mb-3">
              <h3
                class="text-sm font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider"
              >
                1b. Audio Ingestion
              </h3>
              <span
                class="text-xs font-medium text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/30 px-2 py-0.5 rounded-full"
                data-testid="audio-ingestion-cost"
              >
                {{ formatCost(audioCostPerK) }}/1k words
              </span>
            </div>
            <dl class="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 text-sm">
              <div class="flex justify-between sm:block">
                <dt class="text-gray-500 dark:text-gray-400">
                  Transcription Model
                </dt>
                <dd class="font-medium text-gray-900 dark:text-gray-100">
                  {{ store.settings.transcription.model }}
                </dd>
              </div>
              <div class="flex justify-between sm:block">
                <dt class="text-gray-500 dark:text-gray-400">
                  Paragraph Formatting
                </dt>
                <dd class="font-medium text-gray-900 dark:text-gray-100">
                  <label class="inline-flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      class="form-checkbox rounded text-violet-500"
                      :checked="
                        runtimeSettingValue('transcript_formatting') === true
                      "
                      data-testid="transcript-formatting-toggle"
                      @change="
                        store.updateRuntime({
                          transcript_formatting: !runtimeSettingValue(
                            'transcript_formatting',
                          ),
                        })
                      "
                    />
                    <span class="text-sm">{{
                      runtimeSettingValue('transcript_formatting')
                        ? 'Enabled'
                        : 'Disabled'
                    }}</span>
                  </label>
                </dd>
              </div>
              <div
                v-if="runtimeSettingValue('transcript_formatting')"
                class="flex justify-between sm:block"
              >
                <dt class="text-gray-500 dark:text-gray-400">
                  Formatting Model
                </dt>
                <dd class="font-medium text-gray-900 dark:text-gray-100">
                  {{ store.settings.transcript_formatting.model }}
                </dd>
              </div>
            </dl>
          </div>

          <!-- 2. Chunking & Embedding -->
          <div
            class="p-4 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700/60 rounded-xl shadow-xs"
            data-testid="section-chunking"
          >
            <div class="flex items-center justify-between mb-3">
              <h3
                class="text-sm font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider"
              >
                2. Chunking & Embedding
              </h3>
              <span
                class="text-xs font-medium text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/30 px-2 py-0.5 rounded-full"
                data-testid="chunking-cost"
              >
                {{ formatCost(chunkingCost) }}/entry
              </span>
            </div>
            <dl class="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 text-sm">
              <div class="flex justify-between sm:block">
                <dt class="text-gray-500 dark:text-gray-400">Strategy</dt>
                <dd class="font-medium text-gray-900 dark:text-gray-100">
                  {{ store.settings.chunking.strategy }}
                </dd>
              </div>
              <div class="flex justify-between sm:block">
                <dt class="text-gray-500 dark:text-gray-400">
                  Embedding Model
                </dt>
                <dd class="font-medium text-gray-900 dark:text-gray-100">
                  {{ store.settings.embedding.model }}
                </dd>
              </div>
              <div class="flex justify-between sm:block">
                <dt class="text-gray-500 dark:text-gray-400">
                  Embedding Dimensions
                </dt>
                <dd class="font-medium text-gray-900 dark:text-gray-100">
                  {{ store.settings.embedding.dimensions }}
                </dd>
              </div>
              <div class="flex justify-between sm:block">
                <dt class="text-gray-500 dark:text-gray-400">Max Tokens</dt>
                <dd class="font-medium text-gray-900 dark:text-gray-100">
                  {{ store.settings.chunking.max_tokens }}
                </dd>
              </div>
              <div class="flex justify-between sm:block">
                <dt class="text-gray-500 dark:text-gray-400">Min Tokens</dt>
                <dd class="font-medium text-gray-900 dark:text-gray-100">
                  {{ store.settings.chunking.min_tokens }}
                </dd>
              </div>
              <div class="flex justify-between sm:block">
                <dt class="text-gray-500 dark:text-gray-400">Overlap Tokens</dt>
                <dd class="font-medium text-gray-900 dark:text-gray-100">
                  {{ store.settings.chunking.overlap_tokens }}
                </dd>
              </div>
              <div class="flex justify-between sm:block">
                <dt class="text-gray-500 dark:text-gray-400">
                  Boundary Percentile
                </dt>
                <dd class="font-medium text-gray-900 dark:text-gray-100">
                  {{ store.settings.chunking.boundary_percentile }}
                </dd>
              </div>
              <div class="flex justify-between sm:block">
                <dt class="text-gray-500 dark:text-gray-400">
                  Decisive Percentile
                </dt>
                <dd class="font-medium text-gray-900 dark:text-gray-100">
                  {{ store.settings.chunking.decisive_percentile }}
                </dd>
              </div>
              <div class="flex justify-between sm:block">
                <dt class="text-gray-500 dark:text-gray-400">
                  Metadata Prefix
                </dt>
                <dd class="font-medium text-gray-900 dark:text-gray-100">
                  {{
                    store.settings.chunking.embed_metadata_prefix
                      ? 'Enabled'
                      : 'Disabled'
                  }}
                </dd>
              </div>
            </dl>
          </div>

          <!-- 3. Mood Scoring -->
          <div
            class="p-4 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700/60 rounded-xl shadow-xs"
            data-testid="section-mood"
          >
            <div class="flex items-center justify-between mb-3">
              <h3
                class="text-sm font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider"
              >
                3. Mood Scoring
              </h3>
              <span
                v-if="store.settings.features.mood_scoring"
                class="text-xs font-medium text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/30 px-2 py-0.5 rounded-full"
                data-testid="mood-cost"
              >
                {{ formatCost(moodCost) }}/entry
              </span>
              <span
                v-else
                class="text-xs font-medium text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-gray-700 px-2 py-0.5 rounded-full"
              >
                Disabled
              </span>
            </div>
            <dl
              v-if="store.settings.features.mood_scoring"
              class="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 text-sm"
            >
              <div class="flex justify-between sm:block">
                <dt class="text-gray-500 dark:text-gray-400">Model</dt>
                <dd class="font-medium text-gray-900 dark:text-gray-100">
                  {{ store.settings.features.mood_scorer_model }}
                </dd>
              </div>
              <div class="flex justify-between sm:block">
                <dt class="text-gray-500 dark:text-gray-400">Status</dt>
                <dd class="font-medium text-gray-900 dark:text-gray-100">
                  Enabled
                </dd>
              </div>
            </dl>
          </div>

          <!-- 4. Entity Extraction -->
          <div
            class="p-4 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700/60 rounded-xl shadow-xs"
            data-testid="section-entity"
          >
            <div class="flex items-center justify-between mb-3">
              <h3
                class="text-sm font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider"
              >
                4. Entity Extraction
              </h3>
              <span
                class="text-xs font-medium text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/30 px-2 py-0.5 rounded-full"
                data-testid="entity-cost"
              >
                {{ formatCost(entityCost) }}/entry
              </span>
            </div>
            <dl class="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 text-sm">
              <div class="flex justify-between sm:block">
                <dt class="text-gray-500 dark:text-gray-400">Model</dt>
                <dd class="font-medium text-gray-900 dark:text-gray-100">
                  {{ store.settings.entity_extraction.model }}
                </dd>
              </div>
              <div class="flex justify-between sm:block">
                <dt class="text-gray-500 dark:text-gray-400">
                  Dedup Threshold
                </dt>
                <dd class="font-medium text-gray-900 dark:text-gray-100">
                  {{
                    store.settings.entity_extraction.dedup_similarity_threshold
                  }}
                </dd>
              </div>
              <div class="flex justify-between sm:block">
                <dt class="text-gray-500 dark:text-gray-400">
                  Embedding Model
                </dt>
                <dd class="font-medium text-gray-900 dark:text-gray-100">
                  {{ store.settings.embedding.model }}
                </dd>
              </div>
              <div
                class="flex justify-between sm:block"
                data-testid="author-name-field"
              >
                <dt class="text-gray-500 dark:text-gray-400">Author Name</dt>
                <dd class="font-medium text-gray-900 dark:text-gray-100">
                  <template v-if="!editingName">
                    <span data-testid="author-name-value">{{
                      authStore.displayName
                    }}</span>
                    <button
                      class="ml-2 text-xs text-violet-500 hover:text-violet-600 dark:hover:text-violet-400"
                      data-testid="author-name-edit-btn"
                      @click="startEditingName"
                    >
                      Edit
                    </button>
                  </template>
                  <template v-else>
                    <div class="flex items-center gap-2 mt-1">
                      <input
                        v-model="nameInput"
                        type="text"
                        class="form-input text-sm py-1 px-2 w-48"
                        data-testid="author-name-input"
                        @keyup.enter="saveDisplayName"
                        @keyup.escape="cancelEditingName"
                      />
                      <button
                        class="text-xs text-emerald-600 hover:text-emerald-700 dark:text-emerald-400 dark:hover:text-emerald-300 disabled:opacity-50"
                        data-testid="author-name-save-btn"
                        :disabled="nameSaving"
                        @click="saveDisplayName"
                      >
                        {{ nameSaving ? 'Saving...' : 'Save' }}
                      </button>
                      <button
                        class="text-xs text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
                        data-testid="author-name-cancel-btn"
                        @click="cancelEditingName"
                      >
                        Cancel
                      </button>
                    </div>
                    <p
                      v-if="nameError"
                      class="text-xs text-red-600 dark:text-red-400 mt-1"
                      data-testid="author-name-error"
                    >
                      {{ nameError }}
                    </p>
                    <p class="text-xs text-gray-400 dark:text-gray-500 mt-1">
                      Use your full name (e.g. John Mathews) for accurate entity
                      extraction
                    </p>
                  </template>
                </dd>
              </div>
            </dl>
          </div>

          <!-- Re-extract prompt -->
          <div
            v-if="showReextractPrompt"
            class="mt-4 p-4 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700/60 rounded-xl"
            data-testid="reextract-prompt"
          >
            <p class="text-sm text-amber-800 dark:text-amber-200 mb-3">
              Author name changed. Re-run entity extraction on all entries so
              first-person pronouns resolve to the updated name?
            </p>
            <div class="flex gap-2">
              <button
                class="btn text-xs bg-amber-600 hover:bg-amber-700 text-white disabled:opacity-50"
                data-testid="reextract-confirm-btn"
                :disabled="reextractSubmitting"
                @click="triggerReextraction"
              >
                {{
                  reextractSubmitting ? 'Submitting...' : 'Re-run extraction'
                }}
              </button>
              <button
                class="btn text-xs bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600"
                data-testid="reextract-dismiss-btn"
                @click="dismissReextractPrompt"
              >
                Skip
              </button>
            </div>
          </div>
        </div>
      </section>
    </template>
  </main>
</template>
