<script setup lang="ts">
import { onMounted, computed } from 'vue'
import { useSettingsStore } from '@/stores/settings'
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

function runtimeSettingValue(key: string): boolean | string | undefined {
  return store.settings?.runtime.find((s) => s.key === key)?.value
}

const isDualPass = computed(() => {
  if (!store.settings) return false
  return runtimeSettingValue('ocr_dual_pass') === true
})

const p = computed(() => store.pricingConfig)

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
</script>

<template>
  <main class="px-4 sm:px-6 lg:px-8 py-8 w-full max-w-5xl mx-auto">
    <!-- Loading -->
    <div
      v-if="store.loading"
      class="text-gray-600 dark:text-gray-300"
      data-testid="admin-overview-loading"
    >
      Loading...
    </div>

    <!-- Error -->
    <div
      v-else-if="store.error"
      class="rounded-lg bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-700/60 p-4 text-red-800 dark:text-red-200"
      data-testid="admin-overview-error"
    >
      {{ store.error }}
    </div>

    <template v-else>
      <!-- Health Section -->
      <section v-if="store.health" class="mb-8" data-testid="health-section">
        <h2 class="text-lg font-semibold text-gray-800 dark:text-gray-200 mb-4">
          Health
        </h2>

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

      <!-- Total Cost -->
      <section
        v-if="store.settings"
        class="mb-8"
        data-testid="section-total-cost"
      >
        <h2 class="text-lg font-semibold text-gray-800 dark:text-gray-200 mb-4">
          Estimated Cost per 1,000 Words
        </h2>
        <div
          class="p-4 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700/60 rounded-xl shadow-xs"
        >
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
      </section>

      <!-- Quick links -->
      <section data-testid="admin-overview-links">
        <h2 class="text-lg font-semibold text-gray-800 dark:text-gray-200 mb-4">
          Quick links
        </h2>
        <ul class="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
          <li>
            <RouterLink
              to="/admin/users"
              class="block p-3 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700/60 rounded-lg shadow-xs hover:border-violet-400 dark:hover:border-violet-500"
              data-testid="link-admin-users"
            >
              <span class="font-medium text-gray-900 dark:text-gray-100"
                >Users</span
              >
              <p class="text-xs text-gray-600 dark:text-gray-300 mt-0.5">
                Activate or disable users.
              </p>
            </RouterLink>
          </li>
          <li>
            <RouterLink
              to="/admin/runtime"
              class="block p-3 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700/60 rounded-lg shadow-xs hover:border-violet-400 dark:hover:border-violet-500"
              data-testid="link-admin-runtime"
            >
              <span class="font-medium text-gray-900 dark:text-gray-100"
                >Runtime</span
              >
              <p class="text-xs text-gray-600 dark:text-gray-300 mt-0.5">
                Toggles and pipeline configuration.
              </p>
            </RouterLink>
          </li>
          <li>
            <RouterLink
              to="/admin/pricing"
              class="block p-3 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700/60 rounded-lg shadow-xs hover:border-violet-400 dark:hover:border-violet-500"
              data-testid="link-admin-pricing"
            >
              <span class="font-medium text-gray-900 dark:text-gray-100"
                >Pricing</span
              >
              <p class="text-xs text-gray-600 dark:text-gray-300 mt-0.5">
                Model rates that drive cost estimates.
              </p>
            </RouterLink>
          </li>
          <li>
            <RouterLink
              to="/admin/server"
              class="block p-3 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700/60 rounded-lg shadow-xs hover:border-violet-400 dark:hover:border-violet-500"
              data-testid="link-admin-server"
            >
              <span class="font-medium text-gray-900 dark:text-gray-100"
                >Server</span
              >
              <p class="text-xs text-gray-600 dark:text-gray-300 mt-0.5">
                Reload OCR/transcription/mood resources.
              </p>
            </RouterLink>
          </li>
        </ul>
      </section>
    </template>
  </main>
</template>
