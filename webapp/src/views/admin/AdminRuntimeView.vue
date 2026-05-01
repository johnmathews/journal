<script setup lang="ts">
import { onMounted, computed } from 'vue'
import { useSettingsStore } from '@/stores/settings'
import { useToast } from '@/composables/useToast'
import {
  ocrCostPer1000Words,
  ocrDualPassCostPer1000Words,
  audioCostPer1000Words,
  chunkingCostPer1000Words,
  moodScoringCostPer1000Words,
  entityExtractionCostPer1000Words,
  formatCost,
} from '@/utils/cost-estimates'

const store = useSettingsStore()
const toast = useToast()

async function toggleRuntimeSetting(key: string, value: boolean | string) {
  try {
    await store.updateRuntime({ [key]: value })
    toast.success('Setting updated')
  } catch {
    toast.error('Failed to update setting')
  }
}

onMounted(() => {
  store.load()
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
</script>

<template>
  <main class="px-4 sm:px-6 lg:px-8 py-8 w-full max-w-5xl mx-auto">
    <h2
      class="text-xl font-semibold text-gray-800 dark:text-gray-200 mb-6"
      data-testid="admin-runtime-heading"
    >
      Runtime Settings
    </h2>

    <!-- Loading -->
    <div
      v-if="store.loading"
      class="text-gray-600 dark:text-gray-300"
      data-testid="admin-runtime-loading"
    >
      Loading...
    </div>

    <!-- Error -->
    <div
      v-else-if="store.error"
      class="rounded-lg bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-700/60 p-4 text-red-800 dark:text-red-200"
      data-testid="admin-runtime-error"
    >
      {{ store.error }}
    </div>

    <template v-else>
      <!-- Runtime toggles -->
      <section
        v-if="store.settings?.runtime?.length"
        data-testid="runtime-settings-section"
      >
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

      <!-- Processing Pipeline read-only display -->
      <section
        v-if="store.settings"
        class="mt-8"
        data-testid="pipeline-section"
      >
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
                <dt class="text-gray-600 dark:text-gray-300">Provider</dt>
                <dd
                  class="font-medium text-gray-900 dark:text-gray-100"
                  data-testid="transcription-provider"
                >
                  {{ store.settings.transcription.provider }}
                </dd>
              </div>
              <div class="flex justify-between sm:block">
                <dt class="text-gray-600 dark:text-gray-300">Fallback</dt>
                <dd
                  class="font-medium text-gray-900 dark:text-gray-100"
                  data-testid="transcription-fallback"
                >
                  <template
                    v-if="store.settings.transcription.fallback.enabled"
                  >
                    enabled —
                    {{ store.settings.transcription.fallback.model }} (after
                    {{ store.settings.transcription.retry.max_attempts }}
                    retries)
                  </template>
                  <template v-else>disabled</template>
                </dd>
              </div>
              <div class="flex justify-between sm:block">
                <dt class="text-gray-600 dark:text-gray-300">Shadow</dt>
                <dd
                  class="font-medium text-gray-900 dark:text-gray-100"
                  data-testid="transcription-shadow"
                >
                  <template v-if="store.settings.transcription.shadow.enabled">
                    {{ store.settings.transcription.shadow.provider }} /
                    {{ store.settings.transcription.shadow.model }} (logging
                    diffs only)
                  </template>
                  <template v-else>off</template>
                </dd>
              </div>
              <div class="flex justify-between sm:block">
                <dt class="text-gray-600 dark:text-gray-300">
                  Paragraph Formatting
                </dt>
                <dd class="font-medium text-gray-900 dark:text-gray-100">
                  <button
                    type="button"
                    :class="[
                      'relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-violet-500 focus:ring-offset-2 dark:focus:ring-offset-gray-900',
                      runtimeSettingValue('transcript_formatting')
                        ? 'bg-violet-500'
                        : 'bg-gray-200 dark:bg-gray-600',
                    ]"
                    role="switch"
                    :aria-checked="
                      runtimeSettingValue('transcript_formatting') === true
                    "
                    :disabled="store.updating"
                    data-testid="transcript-formatting-toggle"
                    @click="
                      store.updateRuntime({
                        transcript_formatting: !runtimeSettingValue(
                          'transcript_formatting',
                        ),
                      })
                    "
                  >
                    <span
                      :class="[
                        'pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out',
                        runtimeSettingValue('transcript_formatting')
                          ? 'translate-x-5'
                          : 'translate-x-0',
                      ]"
                    />
                  </button>
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
            </dl>
          </div>
        </div>
      </section>
    </template>
  </main>
</template>
