<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useSettingsStore } from '@/stores/settings'
import { useToast } from '@/composables/useToast'

const store = useSettingsStore()
const toast = useToast()

onMounted(() => {
  store.load()
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
