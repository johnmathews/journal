<script setup lang="ts">
import { onMounted, ref, computed, watch } from 'vue'
import { useEntitiesStore } from '@/stores/entities'
import {
  ENTITY_TYPES,
  type EntityType,
  type EntitySummary,
} from '@/types/entity'
import BatchJobModal from '@/components/BatchJobModal.vue'
import BaseModal from '@/components/BaseModal.vue'

const store = useEntitiesStore()

// Sorting state — default: last_seen descending (most recent at top)
type SortKey =
  | 'canonical_name'
  | 'entity_type'
  | 'mention_count'
  | 'first_seen'
  | 'last_seen'
const sortKey = ref<SortKey>('last_seen')
const sortAsc = ref(false)

function toggleSort(key: SortKey) {
  if (sortKey.value === key) {
    sortAsc.value = !sortAsc.value
  } else {
    sortKey.value = key
    sortAsc.value =
      key === 'mention_count' || key === 'last_seen' || key === 'first_seen'
        ? false
        : true
  }
}

function sortIndicator(key: SortKey): string {
  if (sortKey.value !== key) return ''
  return sortAsc.value ? ' \u25B2' : ' \u25BC'
}

const sortedEntities = computed(() => {
  const items = [...store.entities]
  const key = sortKey.value
  const dir = sortAsc.value ? 1 : -1
  return items.sort((a: EntitySummary, b: EntitySummary) => {
    const av = a[key]
    const bv = b[key]
    if (typeof av === 'string' && typeof bv === 'string') {
      return av.localeCompare(bv) * dir
    }
    return ((av as number) - (bv as number)) * dir
  })
})

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
  store.loadMergeCandidates()
})

function typeBadgeClass(type: EntityType): string {
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

// --- Multi-select for merge ---
const selected = ref<Set<number>>(new Set())

function toggleSelect(id: number) {
  const next = new Set(selected.value)
  if (next.has(id)) {
    next.delete(id)
  } else {
    next.add(id)
  }
  selected.value = next
}

function isSelected(id: number): boolean {
  return selected.value.has(id)
}

const selectedCount = computed(() => selected.value.size)
const canMerge = computed(() => selected.value.size >= 2)

function clearSelection() {
  selected.value = new Set()
}

// --- Merge modal ---
const showMergeModal = ref(false)
const survivorId = ref<number | null>(null)
const merging = ref(false)
const mergeError = ref<string | null>(null)

const selectedEntities = computed(() =>
  store.entities.filter((e) => selected.value.has(e.id)),
)

function openMergeModal() {
  if (!canMerge.value) return
  // Default survivor is the entity with most mentions
  const best = selectedEntities.value.reduce((a, b) =>
    a.mention_count >= b.mention_count ? a : b,
  )
  survivorId.value = best.id
  mergeError.value = null
  showMergeModal.value = true
}

// --- Merge review ---
const showMergeReview = ref(false)

async function acceptCandidate(candidateId: number, entityA: EntitySummary, entityB: EntitySummary) {
  // Accept means user wants to merge them. Pick the one with more mentions as survivor.
  const survivor = entityA.mention_count >= entityB.mention_count ? entityA : entityB
  const absorbed = survivor.id === entityA.id ? entityB : entityA
  await store.acceptMergeCandidate(candidateId)
  await store.mergeEntities(survivor.id, [absorbed.id])
  store.loadEntities({ offset: 0 })
}

async function dismissCandidate(candidateId: number) {
  await store.dismissMergeCandidate(candidateId)
}

async function executeMerge() {
  if (survivorId.value === null) return
  const absorbedIds = [...selected.value].filter((id) => id !== survivorId.value)
  if (absorbedIds.length === 0) return

  merging.value = true
  mergeError.value = null
  try {
    await store.mergeEntities(survivorId.value, absorbedIds)
    showMergeModal.value = false
    clearSelection()
    store.loadEntities({ offset: 0 })
  } catch (e) {
    mergeError.value = e instanceof Error ? e.message : 'Merge failed'
  } finally {
    merging.value = false
  }
}
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

    <!-- Merge review banner -->
    <div
      v-if="store.mergeCandidatesTotal > 0"
      class="mb-4"
      data-testid="merge-review-section"
    >
      <button
        class="flex items-center gap-2 text-sm font-medium text-amber-700 dark:text-amber-400 hover:underline"
        data-testid="toggle-merge-review"
        @click="showMergeReview = !showMergeReview"
      >
        <span
          class="inline-flex items-center justify-center h-5 w-5 rounded-full bg-amber-500 text-white text-xs font-bold"
        >
          {{ store.mergeCandidatesTotal }}
        </span>
        Possible duplicates to review
        <svg
          class="w-4 h-4 transition-transform"
          :class="{ 'rotate-180': showMergeReview }"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          stroke-width="2"
        >
          <path d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      <div
        v-if="showMergeReview"
        class="mt-3 space-y-3"
        data-testid="merge-candidates-list"
      >
        <div
          v-for="candidate in store.mergeCandidates"
          :key="candidate.id"
          class="flex items-center gap-3 bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-700/40 rounded-lg px-4 py-3 text-sm"
          :data-testid="`merge-candidate-${candidate.id}`"
        >
          <div class="flex-1">
            <span class="font-medium text-gray-800 dark:text-gray-100">
              {{ candidate.entity_a.canonical_name }}
            </span>
            <span
              class="inline-flex text-[10px] font-medium rounded-full px-2 py-0.5 capitalize mx-1"
              :class="typeBadgeClass(candidate.entity_a.entity_type)"
            >
              {{ candidate.entity_a.entity_type }}
            </span>
            <span class="text-gray-400 dark:text-gray-500 mx-1">~</span>
            <span class="font-medium text-gray-800 dark:text-gray-100">
              {{ candidate.entity_b.canonical_name }}
            </span>
            <span
              class="inline-flex text-[10px] font-medium rounded-full px-2 py-0.5 capitalize mx-1"
              :class="typeBadgeClass(candidate.entity_b.entity_type)"
            >
              {{ candidate.entity_b.entity_type }}
            </span>
            <span class="text-xs text-gray-400 dark:text-gray-500 ml-2">
              {{ (candidate.similarity * 100).toFixed(0) }}% similar
            </span>
          </div>
          <button
            class="btn text-xs py-1 bg-violet-500 hover:bg-violet-600 text-white"
            data-testid="accept-candidate"
            @click="acceptCandidate(candidate.id, candidate.entity_a, candidate.entity_b)"
          >
            Merge
          </button>
          <button
            class="btn text-xs py-1 bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700/60 text-gray-600 dark:text-gray-300"
            data-testid="dismiss-candidate"
            @click="dismissCandidate(candidate.id)"
          >
            Dismiss
          </button>
        </div>
      </div>
    </div>

    <!-- Selection toolbar -->
    <div
      v-if="selectedCount > 0"
      class="mb-4 flex items-center gap-3 bg-violet-50 dark:bg-violet-500/10 border border-violet-200 dark:border-violet-700/40 rounded-lg px-4 py-2 text-sm"
      data-testid="selection-toolbar"
    >
      <span class="text-violet-700 dark:text-violet-300 font-medium">
        {{ selectedCount }} selected
      </span>
      <button
        class="btn bg-violet-500 hover:bg-violet-600 text-white text-xs py-1"
        :disabled="!canMerge"
        data-testid="merge-button"
        @click="openMergeModal"
      >
        Merge selected
      </button>
      <button
        class="text-violet-600 dark:text-violet-400 hover:underline text-xs"
        data-testid="clear-selection"
        @click="clearSelection"
      >
        Clear
      </button>
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
            <th class="px-2 py-3 w-8"></th>
            <th
              class="px-4 py-3 text-left font-semibold cursor-pointer hover:text-gray-700 dark:hover:text-gray-200 select-none"
              data-testid="sort-name"
              @click="toggleSort('canonical_name')"
            >
              Name{{ sortIndicator('canonical_name') }}
            </th>
            <th
              class="px-4 py-3 text-left font-semibold cursor-pointer hover:text-gray-700 dark:hover:text-gray-200 select-none"
              data-testid="sort-type"
              @click="toggleSort('entity_type')"
            >
              Type{{ sortIndicator('entity_type') }}
            </th>
            <th
              class="px-4 py-3 text-right font-semibold cursor-pointer hover:text-gray-700 dark:hover:text-gray-200 select-none"
              data-testid="sort-mentions"
              @click="toggleSort('mention_count')"
            >
              Mentions{{ sortIndicator('mention_count') }}
            </th>
            <th
              class="px-4 py-3 text-left font-semibold cursor-pointer hover:text-gray-700 dark:hover:text-gray-200 select-none"
              data-testid="sort-first-seen"
              @click="toggleSort('first_seen')"
            >
              First seen{{ sortIndicator('first_seen') }}
            </th>
            <th
              class="px-4 py-3 text-left font-semibold cursor-pointer hover:text-gray-700 dark:hover:text-gray-200 select-none"
              data-testid="sort-last-seen"
              @click="toggleSort('last_seen')"
            >
              Last seen{{ sortIndicator('last_seen') }}
            </th>
          </tr>
        </thead>
        <tbody class="divide-y divide-gray-100 dark:divide-gray-700/60">
          <tr
            v-for="entity in sortedEntities"
            :key="entity.id"
            class="hover:bg-gray-50 dark:hover:bg-gray-700/30"
            :class="{ 'bg-violet-50/50 dark:bg-violet-500/5': isSelected(entity.id) }"
            data-testid="entity-row"
          >
            <td class="px-2 py-3 text-center">
              <input
                type="checkbox"
                :checked="isSelected(entity.id)"
                class="form-checkbox h-4 w-4 text-violet-500 rounded border-gray-300 dark:border-gray-600"
                data-testid="entity-checkbox"
                @change="toggleSelect(entity.id)"
              />
            </td>
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
            <td class="px-4 py-3 text-gray-500 dark:text-gray-400">
              {{ entity.last_seen || '—' }}
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

    <!-- Merge modal -->
    <BaseModal v-model="showMergeModal" title="Merge entities" size="md">
      <div class="space-y-4">
        <p class="text-sm text-gray-600 dark:text-gray-300">
          Select which entity to keep. The others will be merged into it — their
          mentions, relationships, and aliases will be reassigned.
        </p>

        <div
          v-if="mergeError"
          class="bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 border border-red-200 dark:border-red-800/40 rounded-lg px-3 py-2 text-sm"
          data-testid="merge-error"
        >
          {{ mergeError }}
        </div>

        <div class="space-y-2">
          <label
            v-for="entity in selectedEntities"
            :key="entity.id"
            class="flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors"
            :class="
              survivorId === entity.id
                ? 'border-violet-400 dark:border-violet-500/60 bg-violet-50 dark:bg-violet-500/10'
                : 'border-gray-200 dark:border-gray-700/60 hover:bg-gray-50 dark:hover:bg-gray-700/30'
            "
            :data-testid="`survivor-option-${entity.id}`"
          >
            <input
              v-model="survivorId"
              type="radio"
              :value="entity.id"
              class="form-radio text-violet-500"
              name="survivor"
            />
            <div class="flex-1">
              <span class="font-medium text-gray-800 dark:text-gray-100">
                {{ entity.canonical_name }}
              </span>
              <span
                class="inline-flex text-[10px] font-medium rounded-full px-2 py-0.5 capitalize ml-2"
                :class="typeBadgeClass(entity.entity_type)"
              >
                {{ entity.entity_type }}
              </span>
              <span class="text-xs text-gray-400 dark:text-gray-500 ml-2">
                {{ entity.mention_count }} mentions
              </span>
            </div>
            <span
              v-if="survivorId === entity.id"
              class="text-xs text-violet-600 dark:text-violet-400 font-medium"
            >
              Keep
            </span>
            <span
              v-else
              class="text-xs text-gray-400 dark:text-gray-500"
            >
              Merge into survivor
            </span>
          </label>
        </div>
      </div>

      <template #footer>
        <button
          class="btn bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700/60 text-gray-600 dark:text-gray-300"
          @click="showMergeModal = false"
        >
          Cancel
        </button>
        <button
          class="btn bg-violet-500 hover:bg-violet-600 text-white"
          :disabled="merging || survivorId === null"
          data-testid="confirm-merge-button"
          @click="executeMerge"
        >
          {{ merging ? 'Merging…' : `Merge ${selectedCount - 1} into survivor` }}
        </button>
      </template>
    </BaseModal>

    <BatchJobModal
      v-model="showBatchModal"
      title="Run entity extraction"
      job-kind="entity_extraction"
      @job-succeeded="onJobSucceeded"
    />
  </div>
</template>
