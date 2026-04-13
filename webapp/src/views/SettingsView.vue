<script setup lang="ts">
import { onMounted, computed } from 'vue'
import { useSettingsStore } from '@/stores/settings'

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

      <!-- Settings Section -->
      <section v-if="store.settings" data-testid="settings-section">
        <h2 class="text-lg font-semibold text-gray-800 dark:text-gray-200 mb-4">
          Configuration
        </h2>

        <div class="space-y-4">
          <!-- OCR -->
          <div
            class="p-4 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700/60 rounded-xl shadow-xs"
          >
            <h3
              class="text-sm font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider mb-3"
            >
              OCR & Ingestion
            </h3>
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
            </dl>
          </div>

          <!-- Chunking -->
          <div
            class="p-4 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700/60 rounded-xl shadow-xs"
          >
            <h3
              class="text-sm font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider mb-3"
            >
              Chunking
            </h3>
            <dl class="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 text-sm">
              <div class="flex justify-between sm:block">
                <dt class="text-gray-500 dark:text-gray-400">Strategy</dt>
                <dd class="font-medium text-gray-900 dark:text-gray-100">
                  {{ store.settings.chunking.strategy }}
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

          <!-- Features -->
          <div
            class="p-4 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700/60 rounded-xl shadow-xs"
          >
            <h3
              class="text-sm font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider mb-3"
            >
              Features
            </h3>
            <dl class="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 text-sm">
              <div class="flex justify-between sm:block">
                <dt class="text-gray-500 dark:text-gray-400">Mood Scoring</dt>
                <dd class="font-medium text-gray-900 dark:text-gray-100">
                  {{
                    store.settings.features.mood_scoring
                      ? 'Enabled'
                      : 'Disabled'
                  }}
                </dd>
              </div>
              <div
                v-if="store.settings.features.mood_scoring"
                class="flex justify-between sm:block"
              >
                <dt class="text-gray-500 dark:text-gray-400">
                  Mood Scorer Model
                </dt>
                <dd class="font-medium text-gray-900 dark:text-gray-100">
                  {{ store.settings.features.mood_scorer_model }}
                </dd>
              </div>
              <div class="flex justify-between sm:block">
                <dt class="text-gray-500 dark:text-gray-400">Author Name</dt>
                <dd class="font-medium text-gray-900 dark:text-gray-100">
                  {{ store.settings.features.journal_author_name }}
                </dd>
              </div>
            </dl>
          </div>
        </div>
      </section>
    </template>
  </main>
</template>
