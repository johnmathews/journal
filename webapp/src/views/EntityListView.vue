<script setup lang="ts">
import { onMounted, ref, computed, watch } from 'vue'
import { useEntitiesStore } from '@/stores/entities'
import { ENTITY_TYPES, type EntityType } from '@/types/entity'
import BatchJobModal from '@/components/BatchJobModal.vue'

const store = useEntitiesStore()

// Local state for the batch-extraction modal. `showBatchModal`
// flips on when the user clicks "Run extraction"; the modal
// handles its own configure → running → done lifecycle and
// emits `job-succeeded` when we should refresh the entity list.
const showBatchModal = ref(false)

function onJobSucceeded(): void {
  store.loadEntities({ offset: 0 })
}

// Local filter state. Kept out of the store so switching tabs doesn't
// leak across views.
const selectedType = ref<EntityType | 'all'>('all')
const searchQuery = ref('')

// Debounce the search input so we don't fire a request per keystroke.
let searchDebounce: ReturnType<typeof setTimeout> | null = null
watch(searchQuery, () => {
  if (searchDebounce) clearTimeout(searchDebounce)
  searchDebounce = setTimeout(() => {
    applyFilters()
  }, 250)
})

watch(selectedType, () => {
  applyFilters()
})

function applyFilters() {
  store.loadEntities({
    type: selectedType.value === 'all' ? undefined : selectedType.value,
    search: searchQuery.value.trim() || undefined,
    offset: 0,
  })
}

onMounted(() => {
  store.loadEntities({ offset: 0 })
})

function typeBadgeClass(type: EntityType): string {
  // Distinct tailwind hues per entity type. Background + text pairs
  // tuned to be readable in both light and dark mode without needing
  // per-theme overrides.
  switch (type) {
    case 'person':
      return 'bg-violet-100 text-violet-700 dark:bg-violet-500/20 dark:text-violet-300'
    case 'place':
      return 'bg-sky-100 text-sky-700 dark:bg-sky-500/20 dark:text-sky-300'
    case 'activity':
      return 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300'
    case 'organization':
      return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-500/20 dark:text-yellow-300'
    case 'topic':
      return 'bg-rose-100 text-rose-700 dark:bg-rose-500/20 dark:text-rose-300'
    case 'other':
    default:
      return 'bg-gray-100 text-gray-700 dark:bg-gray-500/20 dark:text-gray-300'
  }
}

function prevPage() {
  const limit = store.currentParams.limit || 50
  const offset = Math.max(0, (store.currentParams.offset || 0) - limit)
  store.loadEntities({ offset })
}

function nextPage() {
  const limit = store.currentParams.limit || 50
  const offset = (store.currentParams.offset || 0) + limit
  if (offset >= store.total) return
  store.loadEntities({ offset })
}

const canPrev = computed(() => (store.currentParams.offset || 0) > 0)
const canNext = computed(() => {
  const limit = store.currentParams.limit || 50
  const offset = store.currentParams.offset || 0
  return offset + limit < store.total
})
</script>

<template>
  <div data-testid="entity-list-view">
    <div class="mb-6 flex flex-wrap items-center justify-between gap-3">
      <h1
        class="text-2xl md:text-3xl text-gray-800 dark:text-gray-100 font-bold"
      >
        Entities
      </h1>
      <div class="flex items-center gap-2">
        <input
          v-model="searchQuery"
          type="search"
          placeholder="Search entities…"
          data-testid="entity-search"
          class="form-input w-64 text-sm bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700/60 rounded-md"
        />
        <button
          type="button"
          class="btn bg-violet-500 hover:bg-violet-600 text-white"
          data-testid="run-extraction-button"
          @click="showBatchModal = true"
        >
          Run extraction
        </button>
      </div>
    </div>

    <!-- Type filter tabs -->
    <div
      class="flex flex-wrap gap-2 mb-4"
      role="radiogroup"
      aria-label="Filter by entity type"
      data-testid="entity-type-filter"
    >
      <button
        class="px-3 py-1 rounded-full text-xs font-medium border transition-colors"
        :class="
          selectedType === 'all'
            ? 'bg-violet-500 text-white border-violet-500'
            : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 border-gray-200 dark:border-gray-700/60 hover:text-gray-800 dark:hover:text-gray-100'
        "
        :data-testid="`entity-type-all`"
        @click="selectedType = 'all'"
      >
        All
      </button>
      <button
        v-for="t in ENTITY_TYPES"
        :key="t"
        class="px-3 py-1 rounded-full text-xs font-medium border transition-colors capitalize"
        :class="
          selectedType === t
            ? 'bg-violet-500 text-white border-violet-500'
            : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 border-gray-200 dark:border-gray-700/60 hover:text-gray-800 dark:hover:text-gray-100'
        "
        :data-testid="`entity-type-${t}`"
        @click="selectedType = t"
      >
        {{ t }}
      </button>
    </div>

    <!-- Loading / empty / error states -->
    <div
      v-if="store.loading && !store.hasEntities"
      class="py-16 text-center text-gray-500 dark:text-gray-400"
      data-testid="loading-state"
    >
      Loading entities…
    </div>

    <div
      v-else-if="store.error"
      class="mb-4 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 border border-red-200 dark:border-red-800/40 rounded-lg px-4 py-3 text-sm"
      data-testid="error-banner"
    >
      {{ store.error }}
    </div>

    <div
      v-else-if="!store.hasEntities"
      class="py-16 text-center text-gray-500 dark:text-gray-400"
      data-testid="empty-state"
    >
      No entities yet. Click 'Run extraction' above to populate them.
    </div>

    <!-- Entity table -->
    <div
      v-else
      class="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700/60 rounded-xl shadow-xs overflow-hidden"
      data-testid="entity-table"
    >
      <table class="w-full text-sm">
        <thead
          class="text-xs uppercase text-gray-400 dark:text-gray-500 bg-gray-50 dark:bg-gray-900/40"
        >
          <tr>
            <th class="px-4 py-3 text-left font-semibold">Name</th>
            <th class="px-4 py-3 text-left font-semibold">Type</th>
            <th class="px-4 py-3 text-right font-semibold">Mentions</th>
            <th class="px-4 py-3 text-left font-semibold">First seen</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-gray-100 dark:divide-gray-700/60">
          <tr
            v-for="entity in store.entities"
            :key="entity.id"
            class="hover:bg-gray-50 dark:hover:bg-gray-700/30"
            data-testid="entity-row"
          >
            <td class="px-4 py-3">
              <RouterLink
                :to="{
                  name: 'entity-detail',
                  params: { id: entity.id },
                }"
                class="text-violet-600 dark:text-violet-400 hover:underline font-medium"
              >
                {{ entity.canonical_name }}
              </RouterLink>
              <span
                v-if="entity.aliases.length"
                class="text-xs text-gray-400 dark:text-gray-500 ml-2"
              >
                ({{ entity.aliases.join(', ') }})
              </span>
            </td>
            <td class="px-4 py-3">
              <span
                class="inline-flex text-xs font-medium rounded-full px-2.5 py-0.5 capitalize"
                :class="typeBadgeClass(entity.entity_type)"
              >
                {{ entity.entity_type }}
              </span>
            </td>
            <td
              class="px-4 py-3 text-right font-mono text-gray-600 dark:text-gray-300"
            >
              {{ entity.mention_count }}
            </td>
            <td class="px-4 py-3 text-gray-500 dark:text-gray-400">
              {{ entity.first_seen || '—' }}
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- Pagination -->
    <div
      v-if="store.hasEntities"
      class="mt-4 flex items-center justify-between text-sm text-gray-500 dark:text-gray-400"
    >
      <div data-testid="entity-page-info">
        Page {{ store.currentPage }} of {{ Math.max(1, store.totalPages) }} —
        {{ store.total }} entities
      </div>
      <div class="flex gap-2">
        <button
          class="btn bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700/60 text-gray-600 dark:text-gray-300 disabled:opacity-50 disabled:cursor-not-allowed"
          :disabled="!canPrev"
          data-testid="prev-page"
          @click="prevPage"
        >
          Previous
        </button>
        <button
          class="btn bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700/60 text-gray-600 dark:text-gray-300 disabled:opacity-50 disabled:cursor-not-allowed"
          :disabled="!canNext"
          data-testid="next-page"
          @click="nextPage"
        >
          Next
        </button>
      </div>
    </div>

    <BatchJobModal
      v-model="showBatchModal"
      title="Run entity extraction"
      job-kind="entity_extraction"
      @job-succeeded="onJobSucceeded"
    />
  </div>
</template>
