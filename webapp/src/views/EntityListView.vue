<script setup lang="ts">
import { onMounted, ref, computed, watch } from 'vue'
import { useEntitiesStore } from '@/stores/entities'
import {
  ENTITY_TYPES,
  type EntityType,
  type EntitySummary,
  type EntityMention,
  type MergeCandidate,
} from '@/types/entity'
import { fetchEntityMentions } from '@/api/entities'
import BatchJobModal from '@/components/BatchJobModal.vue'
import BaseModal from '@/components/BaseModal.vue'
import { displayName, displayAliases } from '@/utils/entityName'

const store = useEntitiesStore()

// Active vs Quarantined view. The two modes load different
// endpoints — the regular /api/entities call hides quarantined
// entities by design, so we use the dedicated quarantined-list
// endpoint when this tab is active.
type ListMode = 'active' | 'quarantined'
const listMode = ref<ListMode>('active')

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

const visibleEntities = computed<EntitySummary[]>(() =>
  listMode.value === 'quarantined' ? store.quarantinedEntities : store.entities,
)

const sortedEntities = computed(() => {
  const items = [...visibleEntities.value]
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

// Quarantine timestamps land as ISO strings. We render a short
// "2 days ago" string so the operator can see at a glance how
// stale a quarantine is. Falls back to the raw value on parse
// failure.
function relativeFromNow(iso: string): string {
  if (!iso) return ''
  const t = Date.parse(iso)
  if (Number.isNaN(t)) return iso
  const diffMs = Date.now() - t
  const diffSec = Math.round(diffMs / 1000)
  if (diffSec < 60) return 'just now'
  const diffMin = Math.round(diffSec / 60)
  if (diffMin < 60) return `${diffMin} minute${diffMin === 1 ? '' : 's'} ago`
  const diffHr = Math.round(diffMin / 60)
  if (diffHr < 24) return `${diffHr} hour${diffHr === 1 ? '' : 's'} ago`
  const diffDay = Math.round(diffHr / 24)
  if (diffDay < 30) return `${diffDay} day${diffDay === 1 ? '' : 's'} ago`
  const diffMo = Math.round(diffDay / 30)
  if (diffMo < 12) return `${diffMo} month${diffMo === 1 ? '' : 's'} ago`
  const diffYr = Math.round(diffMo / 12)
  return `${diffYr} year${diffYr === 1 ? '' : 's'} ago`
}

// Local state for the batch-extraction modal. `showBatchModal`
// flips on when the user clicks "Run extraction"; the modal
// handles its own configure → running → done lifecycle and
// emits `job-succeeded` when we should refresh the entity list.
const showBatchModal = ref(false)

function onJobSucceeded(): void {
  store.loadEntities({ offset: 0 })
  // Newly-quarantined entities can land via the extraction job.
  // Refresh both lists + the badge so the new state is visible.
  store.loadQuarantined()
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
  // Type/search filters only apply to the active list — the
  // quarantined endpoint does not accept them. Filtering the
  // quarantined list happens client-side via `sortedEntities`
  // when the user types in the search box (the array is
  // already small in practice).
  if (listMode.value !== 'active') return
  store.loadEntities({
    type: selectedType.value === 'all' ? undefined : selectedType.value,
    search: searchQuery.value.trim() || undefined,
    offset: 0,
  })
}

function setListMode(mode: ListMode) {
  if (listMode.value === mode) return
  listMode.value = mode
  clearSelection()
  if (mode === 'quarantined') {
    store.loadQuarantined()
  } else {
    store.loadEntities({ offset: 0 })
  }
}

onMounted(() => {
  // Explicit undefined for type/search resets any filter that leaked
  // in via the store's currentParams from a prior visit — without
  // this, the search box renders empty but the API call still carries
  // the previous search term, so the list looks mysteriously filtered.
  store.loadEntities({ type: undefined, search: undefined, offset: 0 })
  store.loadMergeCandidates()
  // Load quarantined eagerly so the tab badge shows up without
  // the user having to click into it. The list is small.
  store.loadQuarantined()
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

const canPrev = computed(
  () => listMode.value === 'active' && (store.currentParams.offset || 0) > 0,
)
const canNext = computed(() => {
  if (listMode.value !== 'active') return false
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
  visibleEntities.value.filter((e) => selected.value.has(e.id)),
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

// Inline "show context" expander on each merge candidate row.
// Reviewing "Pull Ups ~ Bar (77%)" without context is risky — "Bar"
// could be a pull-up bar (merge!) or a wine bar (don't!). Cache the
// mention quotes per entity ID so toggling expand/collapse on a row
// doesn't re-fetch on every click. We also cache the response's
// `total` because the merge-candidates endpoint embeds bare Entity
// records without aggregated mention_count, so the embedded
// `mention_count` is unreliable here — the mentions endpoint is the
// authoritative source.
const expandedCandidates = ref<Set<number>>(new Set())
const mentionsByEntity = ref<Map<number, EntityMention[]>>(new Map())
const mentionTotalByEntity = ref<Map<number, number>>(new Map())
const loadingMentionsFor = ref<Set<number>>(new Set())
const MENTION_PREVIEW_LIMIT = 3

function isCandidateExpanded(candidateId: number): boolean {
  return expandedCandidates.value.has(candidateId)
}

function isLoadingMentions(entityId: number): boolean {
  return loadingMentionsFor.value.has(entityId)
}

function getEntityMentions(entityId: number): EntityMention[] {
  return mentionsByEntity.value.get(entityId) ?? []
}

function getMentionCount(entity: EntitySummary): number {
  // Prefer the authoritative total from the mentions endpoint (loaded
  // when the row is expanded). The embedded entity from the
  // merge-candidates response carries 0 because the server takes a
  // shortcut and doesn't aggregate. Fall back to the embedded value
  // if it's been populated (e.g. by a future server enrichment).
  const fetched = mentionTotalByEntity.value.get(entity.id)
  if (fetched !== undefined) return fetched
  return entity.mention_count
}

async function loadMentionsForEntity(entityId: number): Promise<void> {
  if (mentionsByEntity.value.has(entityId)) return
  if (loadingMentionsFor.value.has(entityId)) return
  const nextLoading = new Set(loadingMentionsFor.value)
  nextLoading.add(entityId)
  loadingMentionsFor.value = nextLoading
  try {
    const resp = await fetchEntityMentions(entityId, {
      limit: MENTION_PREVIEW_LIMIT,
    })
    const nextMap = new Map(mentionsByEntity.value)
    nextMap.set(entityId, resp.mentions)
    mentionsByEntity.value = nextMap
    const nextTotals = new Map(mentionTotalByEntity.value)
    nextTotals.set(entityId, resp.total)
    mentionTotalByEntity.value = nextTotals
  } finally {
    const cleared = new Set(loadingMentionsFor.value)
    cleared.delete(entityId)
    loadingMentionsFor.value = cleared
  }
}

function toggleCandidateExpand(candidate: MergeCandidate): void {
  const next = new Set(expandedCandidates.value)
  if (next.has(candidate.id)) {
    next.delete(candidate.id)
    expandedCandidates.value = next
    return
  }
  next.add(candidate.id)
  expandedCandidates.value = next
  // Fetch both sides in parallel; cache prevents repeat work.
  void loadMentionsForEntity(candidate.entity_a.id)
  void loadMentionsForEntity(candidate.entity_b.id)
}

function dateRange(entity: EntitySummary): string {
  // Derive end-date from the fetched mentions when the embedded
  // entity record has no `last_seen` (the merge-candidates endpoint
  // doesn't populate it — see comment above the cache refs).
  const fetched = mentionsByEntity.value.get(entity.id) ?? []
  const fetchedLatest = fetched.reduce<string>(
    (acc, m) => (m.entry_date && m.entry_date > acc ? m.entry_date : acc),
    '',
  )
  const last = entity.last_seen || fetchedLatest
  const first = entity.first_seen
  if (!first && !last) return ''
  if (!last || first === last) return first || last
  return `${first || '—'} → ${last}`
}

async function acceptCandidate(
  candidateId: number,
  entityA: EntitySummary,
  entityB: EntitySummary,
) {
  // Accept means user wants to merge them. Pick the one with more mentions as survivor.
  const survivor =
    entityA.mention_count >= entityB.mention_count ? entityA : entityB
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
  const absorbedIds = [...selected.value].filter(
    (id) => id !== survivorId.value,
  )
  if (absorbedIds.length === 0) return

  merging.value = true
  mergeError.value = null
  try {
    await store.mergeEntities(survivorId.value, absorbedIds)
    showMergeModal.value = false
    clearSelection()
    store.loadEntities({ offset: 0 })
    // Merging a quarantined entity into a clean survivor is a
    // valid flow — refresh the quarantined list so absorbed rows
    // disappear from that tab too.
    store.loadQuarantined()
  } catch (e) {
    mergeError.value = e instanceof Error ? e.message : 'Merge failed'
  } finally {
    merging.value = false
  }
}

// --- Release from quarantined tab ---
const releasingId = ref<number | null>(null)

async function releaseRow(id: number) {
  releasingId.value = id
  try {
    await store.releaseEntityQuarantine(id)
    // Refresh the active list so the released entity reappears
    // there with its mention/last_seen counts. The store's
    // releaseEntityQuarantine has already pruned it from the
    // quarantined list.
    if (listMode.value === 'active') {
      store.loadEntities({ offset: 0 })
    }
  } finally {
    releasingId.value = null
  }
}

// --- Hard delete from quarantined tab ---
// Permanently removes the entity row plus (via FK cascade) all of its
// mentions and relationships. Use only when the quarantined entity has no
// salvageable identity — otherwise prefer "Merge into…" to carry the data
// forward to a clean survivor.
const deletingId = ref<number | null>(null)

async function deleteRow(entity: EntitySummary) {
  const confirmed = window.confirm(
    `Permanently delete "${displayName(entity.canonical_name)}"?\n\n` +
      'This removes the entity and all its mentions and relationships. ' +
      'There is no undo. To preserve the underlying data, use Merge instead.',
  )
  if (!confirmed) return
  deletingId.value = entity.id
  try {
    await store.removeEntity(entity.id)
  } finally {
    deletingId.value = null
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
          class="bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-700/40 rounded-lg text-sm overflow-hidden"
          :data-testid="`merge-candidate-${candidate.id}`"
        >
          <div class="flex items-center gap-3 px-4 py-3">
            <button
              type="button"
              class="text-amber-700 dark:text-amber-300 hover:text-amber-800 dark:hover:text-amber-200 shrink-0"
              :aria-expanded="isCandidateExpanded(candidate.id)"
              :aria-label="
                isCandidateExpanded(candidate.id)
                  ? 'Hide context'
                  : 'Show context'
              "
              :data-testid="`toggle-candidate-context-${candidate.id}`"
              @click="toggleCandidateExpand(candidate)"
            >
              <svg
                class="w-4 h-4 transition-transform"
                :class="{ 'rotate-90': isCandidateExpanded(candidate.id) }"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                stroke-width="2"
              >
                <path d="M9 5l7 7-7 7" />
              </svg>
            </button>
            <div class="flex-1">
              <span class="font-medium text-gray-800 dark:text-gray-100">
                {{ displayName(candidate.entity_a.canonical_name) }}
              </span>
              <span
                class="inline-flex text-[10px] font-medium rounded-full px-2 py-0.5 capitalize mx-1"
                :class="typeBadgeClass(candidate.entity_a.entity_type)"
              >
                {{ candidate.entity_a.entity_type }}
              </span>
              <span class="text-gray-600 dark:text-gray-300 mx-1">~</span>
              <span class="font-medium text-gray-800 dark:text-gray-100">
                {{ displayName(candidate.entity_b.canonical_name) }}
              </span>
              <span
                class="inline-flex text-[10px] font-medium rounded-full px-2 py-0.5 capitalize mx-1"
                :class="typeBadgeClass(candidate.entity_b.entity_type)"
              >
                {{ candidate.entity_b.entity_type }}
              </span>
              <span class="text-xs text-gray-600 dark:text-gray-300 ml-2">
                {{ (candidate.similarity * 100).toFixed(0) }}% similar
              </span>
            </div>
            <button
              class="btn text-xs py-1 bg-violet-500 hover:bg-violet-600 text-white"
              data-testid="accept-candidate"
              @click="
                acceptCandidate(
                  candidate.id,
                  candidate.entity_a,
                  candidate.entity_b,
                )
              "
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
          <div
            v-if="isCandidateExpanded(candidate.id)"
            class="grid grid-cols-1 md:grid-cols-2 gap-4 px-4 pb-4 pt-1 border-t border-amber-200/70 dark:border-amber-700/30"
            :data-testid="`merge-candidate-context-${candidate.id}`"
          >
            <div
              v-for="side in [candidate.entity_a, candidate.entity_b]"
              :key="side.id"
              class="bg-white/60 dark:bg-gray-800/40 border border-amber-100 dark:border-amber-700/30 rounded-md p-3"
              data-testid="merge-candidate-side"
            >
              <div class="flex items-baseline gap-2 mb-2">
                <RouterLink
                  :to="{ name: 'entity-detail', params: { id: side.id } }"
                  class="font-medium text-violet-600 dark:text-violet-400 hover:underline"
                >
                  {{ displayName(side.canonical_name) }}
                </RouterLink>
                <span
                  class="inline-flex text-[10px] font-medium rounded-full px-2 py-0.5 capitalize"
                  :class="typeBadgeClass(side.entity_type)"
                >
                  {{ side.entity_type }}
                </span>
              </div>
              <div
                class="text-xs text-gray-600 dark:text-gray-300 mb-2 flex flex-wrap gap-x-3 gap-y-1"
              >
                <span data-testid="side-mention-count">
                  {{ getMentionCount(side) }}
                  {{ getMentionCount(side) === 1 ? 'mention' : 'mentions' }}
                </span>
                <span v-if="dateRange(side)" data-testid="side-date-range">
                  {{ dateRange(side) }}
                </span>
                <span v-if="side.aliases.length" class="italic">
                  ({{ displayAliases(side.aliases) }})
                </span>
              </div>
              <div
                v-if="isLoadingMentions(side.id)"
                class="text-xs text-gray-500 dark:text-gray-400"
                data-testid="side-mentions-loading"
              >
                Loading quotes…
              </div>
              <ul
                v-else-if="getEntityMentions(side.id).length"
                class="space-y-1.5"
              >
                <li
                  v-for="m in getEntityMentions(side.id)"
                  :key="m.id"
                  class="text-xs text-gray-700 dark:text-gray-200"
                  data-testid="side-mention-quote"
                >
                  <RouterLink
                    :to="{
                      name: 'entry-detail',
                      params: { id: m.entry_id },
                      query: { highlight: side.canonical_name },
                    }"
                    class="block hover:bg-amber-100/50 dark:hover:bg-amber-500/5 rounded px-1 -mx-1 py-0.5"
                  >
                    <span class="text-[10px] text-gray-500 dark:text-gray-400">
                      {{ m.entry_date }}
                    </span>
                    <span class="italic ml-2">"{{ m.quote }}"</span>
                  </RouterLink>
                </li>
              </ul>
              <div
                v-else
                class="text-xs italic text-gray-500 dark:text-gray-400"
                data-testid="side-mentions-empty"
              >
                No mention quotes recorded.
              </div>
            </div>
          </div>
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

    <!-- Active / Quarantined mode tabs -->
    <div
      class="flex flex-wrap gap-2 mb-3"
      role="radiogroup"
      aria-label="Active or quarantined entities"
      data-testid="entity-mode-tabs"
    >
      <button
        type="button"
        class="px-3 py-1 rounded-full text-xs font-medium border transition-colors flex items-center gap-2"
        :class="
          listMode === 'active'
            ? 'bg-violet-500 text-white border-violet-500'
            : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 border-gray-200 dark:border-gray-700/60 hover:text-gray-800 dark:hover:text-gray-100'
        "
        data-testid="mode-tab-active"
        @click="setListMode('active')"
      >
        Active
      </button>
      <button
        type="button"
        class="px-3 py-1 rounded-full text-xs font-medium border transition-colors flex items-center gap-2"
        :class="
          listMode === 'quarantined'
            ? 'bg-amber-500 text-white border-amber-500'
            : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 border-gray-200 dark:border-gray-700/60 hover:text-gray-800 dark:hover:text-gray-100'
        "
        data-testid="mode-tab-quarantined"
        @click="setListMode('quarantined')"
      >
        Quarantined
        <span
          v-if="store.quarantinedEntities.length > 0"
          class="inline-flex items-center justify-center min-w-[1.25rem] h-5 px-1.5 rounded-full bg-amber-600 text-white text-[10px] font-bold"
          data-testid="quarantined-badge"
        >
          {{ store.quarantinedEntities.length }}
        </span>
      </button>
    </div>

    <!-- Type filter tabs -->
    <div
      v-if="listMode === 'active'"
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
      v-if="listMode === 'active' ? store.loading && !store.hasEntities : false"
      class="py-16 text-center text-gray-600 dark:text-gray-300"
      data-testid="loading-state"
    >
      Loading entities…
    </div>

    <div
      v-else-if="
        listMode === 'quarantined' &&
        store.quarantinedLoading &&
        store.quarantinedEntities.length === 0
      "
      class="py-16 text-center text-gray-600 dark:text-gray-300"
      data-testid="loading-state"
    >
      Loading quarantined entities…
    </div>

    <div
      v-else-if="store.error"
      class="mb-4 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 border border-red-200 dark:border-red-800/40 rounded-lg px-4 py-3 text-sm"
      data-testid="error-banner"
    >
      {{ store.error }}
    </div>

    <div
      v-else-if="sortedEntities.length === 0"
      class="py-16 text-center text-gray-600 dark:text-gray-300"
      data-testid="empty-state"
    >
      <template v-if="listMode === 'quarantined'">
        <p class="mb-3 font-medium text-gray-700 dark:text-gray-200">
          No quarantined entities.
        </p>
        <p class="mx-auto max-w-prose text-sm">
          When entity extraction runs, any entity whose name no longer appears
          in the text of any entry that mentions it gets quarantined here. This
          usually means the LLM hallucinated the name, or the underlying entry
          was edited and the entity is now stale. Review them here before
          deleting them permanently — or merge them into a clean entity if the
          underlying meaning is still valid.
        </p>
      </template>
      <template v-else>
        No entities yet. Click 'Run extraction' above to populate them.
      </template>
    </div>

    <!-- Entity table -->
    <div
      v-else
      class="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700/60 rounded-xl shadow-xs overflow-hidden"
      data-testid="entity-table"
    >
      <table class="w-full text-sm">
        <thead
          class="text-xs uppercase text-gray-600 dark:text-gray-300 bg-gray-50 dark:bg-gray-900/40"
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
            <template v-if="listMode === 'quarantined'">
              <th
                class="px-4 py-3 text-left font-semibold select-none"
                data-testid="col-quarantine-reason"
              >
                Reason
              </th>
              <th
                class="px-4 py-3 text-left font-semibold select-none"
                data-testid="col-quarantine-when"
              >
                Quarantined
              </th>
              <th class="px-4 py-3 text-right font-semibold select-none"></th>
            </template>
          </tr>
        </thead>
        <tbody class="divide-y divide-gray-100 dark:divide-gray-700/60">
          <tr
            v-for="entity in sortedEntities"
            :key="entity.id"
            class="hover:bg-gray-50 dark:hover:bg-gray-700/30"
            :class="{
              'bg-violet-50/50 dark:bg-violet-500/5': isSelected(entity.id),
            }"
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
                {{ displayName(entity.canonical_name) }}
              </RouterLink>
              <span
                v-if="entity.aliases.length"
                class="text-xs text-gray-600 dark:text-gray-300 ml-2"
              >
                ({{ displayAliases(entity.aliases) }})
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
            <td class="px-4 py-3 text-gray-600 dark:text-gray-300">
              {{ entity.first_seen || '—' }}
            </td>
            <td class="px-4 py-3 text-gray-600 dark:text-gray-300">
              {{ entity.last_seen || '—' }}
            </td>
            <template v-if="listMode === 'quarantined'">
              <td
                class="px-4 py-3 text-gray-600 dark:text-gray-300 max-w-[16rem] truncate"
                :title="entity.quarantine_reason || ''"
                data-testid="quarantine-reason-cell"
              >
                {{ entity.quarantine_reason || '—' }}
              </td>
              <td
                class="px-4 py-3 text-gray-600 dark:text-gray-300"
                :title="entity.quarantined_at || ''"
                data-testid="quarantine-when-cell"
              >
                {{ relativeFromNow(entity.quarantined_at || '') || '—' }}
              </td>
              <td class="px-4 py-3 text-right whitespace-nowrap">
                <button
                  type="button"
                  class="btn text-xs py-1 bg-amber-500 hover:bg-amber-600 text-white disabled:opacity-50 disabled:cursor-not-allowed"
                  :disabled="
                    releasingId === entity.id || deletingId === entity.id
                  "
                  data-testid="release-row-button"
                  @click="releaseRow(entity.id)"
                >
                  {{ releasingId === entity.id ? 'Releasing…' : 'Release' }}
                </button>
                <button
                  type="button"
                  class="btn text-xs py-1 ml-2 bg-red-500 hover:bg-red-600 text-white disabled:opacity-50 disabled:cursor-not-allowed"
                  :disabled="
                    releasingId === entity.id || deletingId === entity.id
                  "
                  data-testid="delete-row-button"
                  @click="deleteRow(entity)"
                >
                  {{ deletingId === entity.id ? 'Deleting…' : 'Delete' }}
                </button>
              </td>
            </template>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- Pagination -->
    <div
      v-if="listMode === 'active' && store.hasEntities"
      class="mt-4 flex items-center justify-between text-sm text-gray-600 dark:text-gray-300"
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
                {{ displayName(entity.canonical_name) }}
              </span>
              <span
                class="inline-flex text-[10px] font-medium rounded-full px-2 py-0.5 capitalize ml-2"
                :class="typeBadgeClass(entity.entity_type)"
              >
                {{ entity.entity_type }}
              </span>
              <span class="text-xs text-gray-600 dark:text-gray-300 ml-2">
                {{ entity.mention_count }} mentions
              </span>
            </div>
            <span
              v-if="survivorId === entity.id"
              class="text-xs text-violet-600 dark:text-violet-400 font-medium"
            >
              Keep
            </span>
            <span v-else class="text-xs text-gray-600 dark:text-gray-300">
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
          {{
            merging ? 'Merging…' : `Merge ${selectedCount - 1} into survivor`
          }}
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
