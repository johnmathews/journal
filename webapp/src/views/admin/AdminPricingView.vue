<script setup lang="ts">
import { onMounted, ref, computed } from 'vue'
import { useSettingsStore } from '@/stores/settings'
import { useToast } from '@/composables/useToast'
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
const toast = useToast()

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
</script>

<template>
  <main class="px-4 sm:px-6 lg:px-8 py-8 w-full max-w-5xl mx-auto">
    <h2
      class="text-xl font-semibold text-gray-800 dark:text-gray-200 mb-6"
      data-testid="admin-pricing-heading"
    >
      API Pricing
    </h2>

    <!-- Loading -->
    <div
      v-if="store.loading"
      class="text-gray-600 dark:text-gray-300"
      data-testid="admin-pricing-loading"
    >
      Loading...
    </div>

    <!-- Error -->
    <div
      v-else-if="store.error"
      class="rounded-lg bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-700/60 p-4 text-red-800 dark:text-red-200"
      data-testid="admin-pricing-error"
    >
      {{ store.error }}
    </div>

    <template v-else-if="store.settings">
      <!-- Estimated Cost per 1,000 Words (derived from current rates + runtime settings) -->
      <section class="mb-8" data-testid="section-total-cost">
        <h3
          class="text-lg font-semibold text-gray-800 dark:text-gray-200 mb-4"
        >
          Estimated Cost per 1,000 Words
        </h3>
        <div
          class="p-4 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700/60 rounded-xl shadow-xs"
        >
          <p class="text-xs text-gray-600 dark:text-gray-300 mb-4">
            Ingestion + one text edit. Updates live as you save rates below.
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

      <div
        class="p-4 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700/60 rounded-xl shadow-xs"
        data-testid="section-api-pricing"
      >
        <p class="text-xs text-gray-600 dark:text-gray-300 mb-4">
          Update when providers change their rates. Cost estimates elsewhere
          recalculate automatically.
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
                  <span class="text-gray-500 dark:text-gray-400">{{
                    entry.last_verified
                  }}</span>
                  <button
                    class="text-violet-500 hover:text-violet-600 dark:hover:text-violet-400 opacity-0 group-hover:opacity-100 transition-opacity"
                    :data-testid="`pricing-edit-${entry.model}`"
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
                      :data-testid="`pricing-input-${entry.model}`"
                    />
                    <input
                      v-model="pricingOutputCost"
                      type="number"
                      step="0.01"
                      class="form-input text-xs py-0.5 px-1.5 w-20"
                      placeholder="Output"
                      :data-testid="`pricing-output-${entry.model}`"
                    />
                  </template>
                  <template v-else>
                    <input
                      v-model="pricingMinuteCost"
                      type="number"
                      step="0.001"
                      class="form-input text-xs py-0.5 px-1.5 w-24"
                      placeholder="$/min"
                      :data-testid="`pricing-minute-${entry.model}`"
                    />
                  </template>
                  <button
                    class="text-xs text-emerald-600 hover:text-emerald-700 dark:text-emerald-400 disabled:opacity-50"
                    :disabled="pricingSaving"
                    :data-testid="`pricing-save-${entry.model}`"
                    @click="savePricing(entry.model, entry.category)"
                  >
                    {{ pricingSaving ? 'Saving...' : 'Save' }}
                  </button>
                  <button
                    class="text-xs text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
                    :data-testid="`pricing-cancel-${entry.model}`"
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
    </template>
  </main>
</template>
