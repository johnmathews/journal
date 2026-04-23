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
  ocrDualPassCostPer1000Words,
  audioCostPer1000Words,
  chunkingCostPer1000Words,
  moodScoringCostPer1000Words,
  entityExtractionCostPer1000Words,
  totalImageIngestionCostPer1000Words,
  totalAudioIngestionCostPer1000Words,
  totalEditCostPer1000Words,
  formatCost,
  DUAL_PASS_MODELS,
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

const isDualPass = computed(() => {
  if (!store.settings) return false
  return runtimeSettingValue('ocr_dual_pass') === true
})

const p = computed(() => store.pricingConfig)

const chunkingCostPerK = computed(() => {
  if (!store.settings) return null
  return chunkingCostPer1000Words(store.settings.embedding.model, p.value)
})

const moodCostPerK = computed(() => {
  if (!store.settings) return null
  return moodScoringCostPer1000Words(
    store.settings.features.mood_scorer_model,
    p.value,
  )
})

const entityCostPerK = computed(() => {
  if (!store.settings) return null
  return entityExtractionCostPer1000Words(
    store.settings.entity_extraction.model,
    store.settings.embedding.model,
    p.value,
  )
})

const imageIngestionTotal = computed(() => {
  if (!store.settings) return null
  const moodModel = store.settings.features.mood_scoring
    ? store.settings.features.mood_scorer_model
    : null
  return totalImageIngestionCostPer1000Words(
    isDualPass.value ? DUAL_PASS_MODELS.primary : store.settings.ocr.model,
    store.settings.embedding.model,
    moodModel,
    store.settings.entity_extraction.model,
    isDualPass.value ? DUAL_PASS_MODELS.secondary : undefined,
    p.value,
  )
})

const audioIngestionTotal = computed(() => {
  if (!store.settings) return null
  const formattingEnabled =
    (store.settings.runtime.find((s) => s.key === 'transcript_formatting')
      ?.value as boolean) ?? false
  const moodModel = store.settings.features.mood_scoring
    ? store.settings.features.mood_scorer_model
    : null
  return totalAudioIngestionCostPer1000Words(
    store.settings.transcription.model,
    formattingEnabled,
    formattingEnabled ? store.settings.transcript_formatting.model : null,
    store.settings.embedding.model,
    moodModel,
    store.settings.entity_extraction.model,
    p.value,
  )
})

const editTotal = computed(() => {
  if (!store.settings) return null
  const moodModel = store.settings.features.mood_scoring
    ? store.settings.features.mood_scorer_model
    : null
  return totalEditCostPer1000Words(
    store.settings.embedding.model,
    moodModel,
    store.settings.entity_extraction.model,
    p.value,
  )
})

const imageGrandTotal = computed(() => {
  if (imageIngestionTotal.value === null || editTotal.value === null)
    return null
  return imageIngestionTotal.value + editTotal.value
})

const audioGrandTotal = computed(() => {
  if (audioIngestionTotal.value === null || editTotal.value === null)
    return null
  return audioIngestionTotal.value + editTotal.value
})

const ocrCostPerK = computed(() => {
  if (!store.settings) return null
  if (isDualPass.value) return ocrDualPassCostPer1000Words(p.value)
  return ocrCostPer1000Words(store.settings.ocr.model, p.value)
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
    p.value,
  )
})

function runtimeSettingValue(key: string): boolean | string | undefined {
  return store.settings?.runtime.find((s) => s.key === key)?.value
}

const showMoodBackfillModal = ref(false)
const showEntityExtractionModal = ref(false)

// Pricing editor state
const editingPricingModel = ref<string | null>(null)
const pricingInputCost = ref('')
const pricingOutputCost = ref('')
const pricingMinuteCost = ref('')
const pricingSaving = ref(false)

function startEditingPricing(entry: {
  model: string
  category: string
  input_cost_per_mtok: number | null
  output_cost_per_mtok: number | null
  cost_per_minute: number | null
}) {
  editingPricingModel.value = entry.model
  pricingInputCost.value =
    entry.input_cost_per_mtok != null ? String(entry.input_cost_per_mtok) : ''
  pricingOutputCost.value =
    entry.output_cost_per_mtok != null ? String(entry.output_cost_per_mtok) : ''
  pricingMinuteCost.value =
    entry.cost_per_minute != null ? String(entry.cost_per_minute) : ''
}

function cancelEditingPricing() {
  editingPricingModel.value = null
}

async function savePricing(model: string, category: string) {
  pricingSaving.value = true
  try {
    const changes: Record<string, number | string> = {
      last_verified: new Date().toISOString().slice(0, 10),
    }
    if (category === 'transcription') {
      changes.cost_per_minute = parseFloat(pricingMinuteCost.value)
    } else {
      changes.input_cost_per_mtok = parseFloat(pricingInputCost.value)
      changes.output_cost_per_mtok = parseFloat(pricingOutputCost.value)
    }
    await store.updatePricing({ [model]: changes })
    editingPricingModel.value = null
    toast.success('Pricing updated')
  } catch {
    toast.error('Failed to update pricing')
  } finally {
    pricingSaving.value = false
  }
}

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
      class="text-gray-600 dark:text-gray-300"
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
            <span class="text-sm text-gray-600 dark:text-gray-300">Status</span>
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
            <span class="text-sm text-gray-600 dark:text-gray-300">Uptime</span>
            <p
              class="text-lg font-semibold text-gray-900 dark:text-gray-100"
              data-testid="health-uptime"
            >
              {{ formatUptime(store.health.queries.uptime_seconds) }}
            </p>
          </div>
          <div class="h-8 w-px bg-gray-200 dark:bg-gray-700" />
          <div>
            <span class="text-sm text-gray-600 dark:text-gray-300"
              >Entries</span
            >
            <p class="text-lg font-semibold text-gray-900 dark:text-gray-100">
              {{ store.health.ingestion.total_entries.toLocaleString() }}
            </p>
          </div>
          <div class="h-8 w-px bg-gray-200 dark:bg-gray-700" />
          <div>
            <span class="text-sm text-gray-600 dark:text-gray-300">Chunks</span>
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
              class="text-xs text-gray-600 dark:text-gray-300 uppercase tracking-wider mb-1"
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
              class="text-xs text-gray-600 dark:text-gray-300 mt-1 truncate"
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
              class="text-xs text-gray-600 dark:text-gray-300 uppercase tracking-wider mb-1"
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
              class="text-xs text-gray-600 dark:text-gray-300 uppercase tracking-wider mb-1"
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
              class="text-xs text-gray-600 dark:text-gray-300 uppercase tracking-wider mb-1"
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
              class="text-xs text-gray-600 dark:text-gray-300 uppercase tracking-wider mb-1"
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
              <p class="text-xs text-gray-600 dark:text-gray-300">
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
                <p class="text-xs text-gray-600 dark:text-gray-300">
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
                <p class="text-xs text-gray-600 dark:text-gray-300">
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
                <dt class="text-gray-600 dark:text-gray-300">OCR Provider</dt>
                <dd
                  class="font-medium text-gray-900 dark:text-gray-100"
                  data-testid="ocr-provider"
                >
                  {{ store.settings.ocr.provider }}
                </dd>
              </div>
              <div class="flex justify-between sm:block">
                <dt class="text-gray-600 dark:text-gray-300">OCR Model</dt>
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
                <dt class="text-gray-600 dark:text-gray-300">
                  Transcription Model
                </dt>
                <dd class="font-medium text-gray-900 dark:text-gray-100">
                  {{ store.settings.transcription.model }}
                </dd>
              </div>
              <div class="flex justify-between sm:block">
                <dt class="text-gray-600 dark:text-gray-300">
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
                <dt class="text-gray-600 dark:text-gray-300">
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
                {{ formatCost(chunkingCostPerK) }}/1k words
              </span>
            </div>
            <dl class="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 text-sm">
              <div class="flex justify-between sm:block">
                <dt class="text-gray-600 dark:text-gray-300">Strategy</dt>
                <dd class="font-medium text-gray-900 dark:text-gray-100">
                  {{ store.settings.chunking.strategy }}
                </dd>
              </div>
              <div class="flex justify-between sm:block">
                <dt class="text-gray-600 dark:text-gray-300">
                  Embedding Model
                </dt>
                <dd class="font-medium text-gray-900 dark:text-gray-100">
                  {{ store.settings.embedding.model }}
                </dd>
              </div>
              <div class="flex justify-between sm:block">
                <dt class="text-gray-600 dark:text-gray-300">
                  Embedding Dimensions
                </dt>
                <dd class="font-medium text-gray-900 dark:text-gray-100">
                  {{ store.settings.embedding.dimensions }}
                </dd>
              </div>
              <div class="flex justify-between sm:block">
                <dt class="text-gray-600 dark:text-gray-300">Max Tokens</dt>
                <dd class="font-medium text-gray-900 dark:text-gray-100">
                  {{ store.settings.chunking.max_tokens }}
                </dd>
              </div>
              <div class="flex justify-between sm:block">
                <dt class="text-gray-600 dark:text-gray-300">Min Tokens</dt>
                <dd class="font-medium text-gray-900 dark:text-gray-100">
                  {{ store.settings.chunking.min_tokens }}
                </dd>
              </div>
              <div class="flex justify-between sm:block">
                <dt class="text-gray-600 dark:text-gray-300">Overlap Tokens</dt>
                <dd class="font-medium text-gray-900 dark:text-gray-100">
                  {{ store.settings.chunking.overlap_tokens }}
                </dd>
              </div>
              <div class="flex justify-between sm:block">
                <dt class="text-gray-600 dark:text-gray-300">
                  Boundary Percentile
                </dt>
                <dd class="font-medium text-gray-900 dark:text-gray-100">
                  {{ store.settings.chunking.boundary_percentile }}
                </dd>
              </div>
              <div class="flex justify-between sm:block">
                <dt class="text-gray-600 dark:text-gray-300">
                  Decisive Percentile
                </dt>
                <dd class="font-medium text-gray-900 dark:text-gray-100">
                  {{ store.settings.chunking.decisive_percentile }}
                </dd>
              </div>
              <div class="flex justify-between sm:block">
                <dt class="text-gray-600 dark:text-gray-300">
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
                {{ formatCost(moodCostPerK) }}/1k words
              </span>
              <span
                v-else
                class="text-xs font-medium text-gray-600 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 px-2 py-0.5 rounded-full"
              >
                Disabled
              </span>
            </div>
            <dl
              v-if="store.settings.features.mood_scoring"
              class="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 text-sm"
            >
              <div class="flex justify-between sm:block">
                <dt class="text-gray-600 dark:text-gray-300">Model</dt>
                <dd class="font-medium text-gray-900 dark:text-gray-100">
                  {{ store.settings.features.mood_scorer_model }}
                </dd>
              </div>
              <div class="flex justify-between sm:block">
                <dt class="text-gray-600 dark:text-gray-300">Status</dt>
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
                {{ formatCost(entityCostPerK) }}/1k words
              </span>
            </div>
            <dl class="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 text-sm">
              <div class="flex justify-between sm:block">
                <dt class="text-gray-600 dark:text-gray-300">Model</dt>
                <dd class="font-medium text-gray-900 dark:text-gray-100">
                  {{ store.settings.entity_extraction.model }}
                </dd>
              </div>
              <div class="flex justify-between sm:block">
                <dt class="text-gray-600 dark:text-gray-300">
                  Dedup Threshold
                </dt>
                <dd class="font-medium text-gray-900 dark:text-gray-100">
                  {{
                    store.settings.entity_extraction.dedup_similarity_threshold
                  }}
                </dd>
              </div>
              <div class="flex justify-between sm:block">
                <dt class="text-gray-600 dark:text-gray-300">
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
                <dt class="text-gray-600 dark:text-gray-300">Author Name</dt>
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
                    <p class="text-xs text-gray-600 dark:text-gray-300 mt-1">
                      Use your full name (e.g. John Mathews) for accurate entity
                      extraction
                    </p>
                  </template>
                </dd>
              </div>
            </dl>
          </div>

          <!-- Total Estimated Cost -->
          <div
            class="p-4 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700/60 rounded-xl shadow-xs"
            data-testid="section-total-cost"
          >
            <h3
              class="text-sm font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider mb-3"
            >
              Estimated Cost per 1,000 Words
            </h3>
            <p class="text-xs text-gray-600 dark:text-gray-300 mb-4">
              Ingestion + one text edit. Costs update with current settings.
            </p>
            <div class="space-y-3 text-sm">
              <!-- Image ingestion subtotal -->
              <div>
                <div
                  class="flex justify-between text-gray-600 dark:text-gray-300 mb-1"
                >
                  <span class="font-medium text-gray-700 dark:text-gray-300"
                    >Image Ingestion</span
                  >
                  <span
                    class="font-medium text-gray-900 dark:text-gray-100"
                    data-testid="image-ingestion-subtotal"
                    >{{ formatCost(imageIngestionTotal) }}</span
                  >
                </div>
                <div
                  class="ml-3 space-y-0.5 text-xs text-gray-600 dark:text-gray-300"
                >
                  <div class="flex justify-between">
                    <span>OCR{{ isDualPass ? ' (dual-pass)' : '' }}</span>
                    <span>{{ formatCost(ocrCostPerK) }}</span>
                  </div>
                  <div class="flex justify-between">
                    <span>Chunking & Embedding</span>
                    <span>{{ formatCost(chunkingCostPerK) }}</span>
                  </div>
                  <div
                    v-if="store.settings.features.mood_scoring"
                    class="flex justify-between"
                  >
                    <span>Mood Scoring</span>
                    <span>{{ formatCost(moodCostPerK) }}</span>
                  </div>
                  <div class="flex justify-between">
                    <span>Entity Extraction</span>
                    <span>{{ formatCost(entityCostPerK) }}</span>
                  </div>
                </div>
              </div>

              <!-- Audio ingestion subtotal -->
              <div>
                <div
                  class="flex justify-between text-gray-600 dark:text-gray-300 mb-1"
                >
                  <span class="font-medium text-gray-700 dark:text-gray-300"
                    >Audio Ingestion</span
                  >
                  <span
                    class="font-medium text-gray-900 dark:text-gray-100"
                    data-testid="audio-ingestion-subtotal"
                    >{{ formatCost(audioIngestionTotal) }}</span
                  >
                </div>
                <div
                  class="ml-3 space-y-0.5 text-xs text-gray-600 dark:text-gray-300"
                >
                  <div class="flex justify-between">
                    <span>Transcription</span>
                    <span>{{ formatCost(audioCostPerK) }}</span>
                  </div>
                  <div class="flex justify-between">
                    <span>Chunking & Embedding</span>
                    <span>{{ formatCost(chunkingCostPerK) }}</span>
                  </div>
                  <div
                    v-if="store.settings.features.mood_scoring"
                    class="flex justify-between"
                  >
                    <span>Mood Scoring</span>
                    <span>{{ formatCost(moodCostPerK) }}</span>
                  </div>
                  <div class="flex justify-between">
                    <span>Entity Extraction</span>
                    <span>{{ formatCost(entityCostPerK) }}</span>
                  </div>
                </div>
              </div>

              <!-- Edit subtotal -->
              <div>
                <div
                  class="flex justify-between text-gray-600 dark:text-gray-300 mb-1"
                >
                  <span class="font-medium text-gray-700 dark:text-gray-300"
                    >First Edit</span
                  >
                  <span
                    class="font-medium text-gray-900 dark:text-gray-100"
                    data-testid="edit-subtotal"
                    >{{ formatCost(editTotal) }}</span
                  >
                </div>
                <div
                  class="ml-3 space-y-0.5 text-xs text-gray-600 dark:text-gray-300"
                >
                  <div class="flex justify-between">
                    <span>Chunking & Embedding</span>
                    <span>{{ formatCost(chunkingCostPerK) }}</span>
                  </div>
                  <div
                    v-if="store.settings.features.mood_scoring"
                    class="flex justify-between"
                  >
                    <span>Mood Scoring</span>
                    <span>{{ formatCost(moodCostPerK) }}</span>
                  </div>
                  <div class="flex justify-between">
                    <span>Entity Extraction</span>
                    <span>{{ formatCost(entityCostPerK) }}</span>
                  </div>
                </div>
              </div>

              <!-- Grand totals -->
              <div
                class="pt-2 space-y-1 border-t border-gray-200 dark:border-gray-700"
              >
                <div class="flex justify-between">
                  <span class="font-semibold text-gray-800 dark:text-gray-200"
                    >Total (image + edit)</span
                  >
                  <span
                    class="font-semibold text-gray-900 dark:text-gray-100"
                    data-testid="image-grand-total"
                    >{{ formatCost(imageGrandTotal) }}</span
                  >
                </div>
                <div class="flex justify-between">
                  <span class="font-semibold text-gray-800 dark:text-gray-200"
                    >Total (audio + edit)</span
                  >
                  <span
                    class="font-semibold text-gray-900 dark:text-gray-100"
                    data-testid="audio-grand-total"
                    >{{ formatCost(audioGrandTotal) }}</span
                  >
                </div>
              </div>
            </div>
          </div>

          <!-- API Pricing -->
          <div
            class="p-4 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700/60 rounded-xl shadow-xs"
            data-testid="section-api-pricing"
          >
            <h3
              class="text-sm font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider mb-1"
            >
              API Pricing
            </h3>
            <p class="text-xs text-gray-600 dark:text-gray-300 mb-4">
              Update when providers change their rates. Costs above recalculate
              automatically.
            </p>

            <template
              v-for="category in ['llm', 'embedding', 'transcription']"
              :key="category"
            >
              <h4
                class="text-xs font-medium text-gray-600 dark:text-gray-300 uppercase tracking-wider mt-3 mb-2"
              >
                {{
                  category === 'llm'
                    ? 'LLM Models'
                    : category === 'embedding'
                      ? 'Embedding Models'
                      : 'Transcription Models'
                }}
              </h4>
              <div class="space-y-1">
                <template
                  v-for="entry in (store.settings.pricing ?? []).filter(
                    (e) => e.category === category,
                  )"
                  :key="entry.model"
                >
                  <div
                    v-if="editingPricingModel !== entry.model"
                    class="flex items-center justify-between text-sm py-1 group"
                  >
                    <span
                      class="font-medium text-gray-900 dark:text-gray-100 min-w-0 truncate"
                      >{{ entry.model }}</span
                    >
                    <div
                      class="flex items-center gap-3 text-xs text-gray-600 dark:text-gray-300 shrink-0"
                    >
                      <template v-if="category !== 'transcription'">
                        <span>${{ entry.input_cost_per_mtok }}/MTok in</span>
                        <span>${{ entry.output_cost_per_mtok }}/MTok out</span>
                      </template>
                      <template v-else>
                        <span>${{ entry.cost_per_minute }}/min</span>
                      </template>
                      <span class="text-gray-600 dark:text-gray-300">{{
                        entry.last_verified
                      }}</span>
                      <button
                        class="text-violet-500 hover:text-violet-600 dark:hover:text-violet-400 opacity-0 group-hover:opacity-100 transition-opacity"
                        @click="startEditingPricing(entry)"
                      >
                        Edit
                      </button>
                    </div>
                  </div>
                  <div v-else class="flex items-center gap-2 text-sm py-1">
                    <span
                      class="font-medium text-gray-900 dark:text-gray-100 min-w-0 truncate shrink-0"
                      >{{ entry.model }}</span
                    >
                    <div class="flex items-center gap-2 ml-auto shrink-0">
                      <template v-if="category !== 'transcription'">
                        <input
                          v-model="pricingInputCost"
                          type="number"
                          step="0.01"
                          class="form-input text-xs py-0.5 px-1.5 w-20"
                          placeholder="Input"
                        />
                        <input
                          v-model="pricingOutputCost"
                          type="number"
                          step="0.01"
                          class="form-input text-xs py-0.5 px-1.5 w-20"
                          placeholder="Output"
                        />
                      </template>
                      <template v-else>
                        <input
                          v-model="pricingMinuteCost"
                          type="number"
                          step="0.001"
                          class="form-input text-xs py-0.5 px-1.5 w-24"
                          placeholder="$/min"
                        />
                      </template>
                      <button
                        class="text-xs text-emerald-600 hover:text-emerald-700 dark:text-emerald-400 disabled:opacity-50"
                        :disabled="pricingSaving"
                        @click="savePricing(entry.model, entry.category)"
                      >
                        {{ pricingSaving ? 'Saving...' : 'Save' }}
                      </button>
                      <button
                        class="text-xs text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
                        @click="cancelEditingPricing"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                </template>
              </div>
            </template>
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
