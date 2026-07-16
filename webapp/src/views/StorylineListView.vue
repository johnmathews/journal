<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useStorylinesStore } from '@/stores/storylines'
import { useToast } from '@/composables/useToast'
import { useInfiniteList } from '@/composables/useInfiniteList'
import StorylineCreateModal from '@/components/StorylineCreateModal.vue'
import type { StorylineSummary } from '@/types/storyline'

const router = useRouter()
const store = useStorylinesStore()
const toast = useToast()

const PAGE_SIZE = 20

type SortKey = 'name' | 'updated_at' | 'created_at' | 'anchors'
const sortKey = ref<SortKey>('updated_at')
const sortAsc = ref(false)

function toggleSort(key: SortKey): void {
  if (sortKey.value === key) {
    sortAsc.value = !sortAsc.value
  } else {
    sortKey.value = key
    // Names sort A→Z by default; everything else newest-first.
    sortAsc.value = key === 'name'
  }
}

function sortIndicator(key: SortKey): string {
  if (sortKey.value !== key) return ''
  return sortAsc.value ? ' ▲' : ' ▼'
}

function anchorsSortKey(s: StorylineSummary): string {
  // Sort by the canonical_name of the first anchor; empty string for
  // anchorless rows (shouldn't happen post-0028 but stays stable).
  return s.anchors.length > 0 ? (s.anchors[0]?.canonical_name ?? '') : ''
}

const sortedStorylines = computed(() => {
  const items = [...store.storylines]
  const key = sortKey.value
  const dir = sortAsc.value ? 1 : -1
  return items.sort((a: StorylineSummary, b: StorylineSummary) => {
    if (key === 'anchors') {
      return anchorsSortKey(a).localeCompare(anchorsSortKey(b)) * dir
    }
    const av = (a[key] ?? '') as string | number
    const bv = (b[key] ?? '') as string | number
    if (typeof av === 'string' && typeof bv === 'string') {
      return av.localeCompare(bv) * dir
    }
    return ((av as number) - (bv as number)) * dir
  })
})

// Whole-dataset search. The term is filtered in SQL on the server over
// name + description; typing resets the list to offset 0 so appends
// continue from the filtered result set.
const searchQuery = ref('')

// Debounce the search input so we don't fire a request per keystroke.
let searchDebounce: ReturnType<typeof setTimeout> | null = null
watch(searchQuery, () => {
  if (searchDebounce) clearTimeout(searchDebounce)
  searchDebounce = setTimeout(() => {
    store.loadStorylines({
      search: searchQuery.value.trim() || undefined,
      offset: 0,
    })
  }, 250)
})

onMounted(() => {
  // Explicit undefined for search resets any filter that leaked in via
  // the store's currentParams from a prior visit — without this the
  // search box renders empty but the API call still carries the previous
  // term, so the list looks mysteriously filtered.
  store.loadStorylines({ limit: PAGE_SIZE, search: undefined, offset: 0 })
})

// Infinite scroll: the sentinel (rendered below the table) auto-appends
// the next page when scrolled into view; the visible "Load more" button
// drives the same append manually as a fallback for environments without
// IntersectionObserver.
const { sentinelRef, loadMore, canLoadMore } = useInfiniteList({
  loadMore: () => store.loadMoreStorylines(),
  canLoadMore: () => store.hasMore && !store.loading,
})

function onRowClick(id: number): void {
  router.push({ name: 'storyline-detail', params: { id } })
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return '—'
  return new Date(dateStr).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

function formatDateTime(dateStr: string | null): string {
  if (!dateStr) return '—'
  return new Date(dateStr).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

// --- Create modal (W9) ---
const createModalOpen = ref(false)

function openCreateModal(): void {
  createModalOpen.value = true
}

function onCreated(): void {
  // Refresh so the new row is visible. The bootstrap job is tracked by
  // the store, which reloads the list again when the job completes.
  store.loadStorylines(store.currentParams)
}

// --- Multi-select (W10) ---
const selectedIds = ref<Set<number>>(new Set())

function isSelected(id: number): boolean {
  return selectedIds.value.has(id)
}

function toggleSelect(id: number): void {
  const next = new Set(selectedIds.value)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  selectedIds.value = next
}

const allOnPageSelected = computed<boolean>(() => {
  if (sortedStorylines.value.length === 0) return false
  return sortedStorylines.value.every((s) => selectedIds.value.has(s.id))
})

function toggleSelectAllOnPage(): void {
  if (allOnPageSelected.value) {
    const next = new Set(selectedIds.value)
    for (const s of sortedStorylines.value) next.delete(s.id)
    selectedIds.value = next
  } else {
    const next = new Set(selectedIds.value)
    for (const s of sortedStorylines.value) next.add(s.id)
    selectedIds.value = next
  }
}

function clearSelection(): void {
  selectedIds.value = new Set()
}

const selectedCount = computed<number>(() => selectedIds.value.size)

// --- Delete (W10) ---
const deleteError = ref<string | null>(null)

async function onDeleteRow(storyline: StorylineSummary): Promise<void> {
  const ok = window.confirm(
    `Delete storyline "${storyline.name}"? This cannot be undone.`,
  )
  if (!ok) return
  deleteError.value = null
  try {
    await store.removeStoryline(storyline.id)
    // Drop it from the selection set if it was selected.
    if (selectedIds.value.has(storyline.id)) {
      const next = new Set(selectedIds.value)
      next.delete(storyline.id)
      selectedIds.value = next
    }
    toast.success(`Deleted "${storyline.name}".`)
  } catch (e) {
    deleteError.value = e instanceof Error ? e.message : 'Delete failed'
  }
}

async function onBulkDelete(): Promise<void> {
  const ids = [...selectedIds.value]
  if (ids.length === 0) return
  const ok = window.confirm(
    `Delete ${ids.length} storyline(s)? This cannot be undone.`,
  )
  if (!ok) return
  deleteError.value = null
  let successCount = 0
  const failed: number[] = []
  for (const id of ids) {
    try {
      await store.removeStoryline(id)
      successCount++
    } catch {
      failed.push(id)
    }
  }
  // Clear all selected (whether deleted or failed) — the user can
  // re-select failing ones if they want to retry.
  clearSelection()
  if (failed.length === 0) {
    toast.success(`Deleted ${successCount} storyline(s).`)
  } else {
    deleteError.value = `${failed.length} delete(s) failed (ids: ${failed.join(', ')})`
    toast.error(
      `Deleted ${successCount} of ${ids.length}; ${failed.length} failed.`,
    )
  }
}
</script>

<template>
  <div class="storyline-list" data-testid="storyline-list-view">
    <!-- Page header -->
    <div class="sm:flex sm:justify-between sm:items-center mb-8">
      <div class="mb-4 sm:mb-0">
        <h1
          class="text-2xl md:text-3xl text-gray-800 dark:text-gray-100 font-bold"
        >
          Storylines
        </h1>
      </div>
      <div class="flex items-center gap-4">
        <div
          v-if="store.total > 0"
          class="text-sm text-gray-600 dark:text-gray-300"
          data-testid="storyline-count"
        >
          {{ store.total }} storylines
        </div>
        <input
          v-model="searchQuery"
          type="search"
          placeholder="Search storylines…"
          data-testid="storylines-search-input"
          class="form-input w-64 text-sm bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700/60 rounded-md"
        />
        <button
          type="button"
          class="btn bg-violet-500 hover:bg-violet-600 text-white"
          data-testid="new-storyline-button"
          @click="openCreateModal"
        >
          New storyline
        </button>
      </div>
    </div>

    <!-- Error banner -->
    <div
      v-if="store.error"
      class="mb-4 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 border border-red-200 dark:border-red-800/40 rounded-lg px-4 py-3 text-sm"
      data-testid="error-banner"
    >
      {{ store.error }}
    </div>

    <!-- Delete error banner -->
    <div
      v-if="deleteError"
      class="mb-4 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 border border-red-200 dark:border-red-800/40 rounded-lg px-4 py-3 text-sm"
      data-testid="delete-error-banner"
    >
      {{ deleteError }}
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
        type="button"
        class="btn bg-red-500 hover:bg-red-600 text-white text-xs py-1"
        data-testid="bulk-delete-button"
        @click="onBulkDelete"
      >
        Delete {{ selectedCount }} selected
      </button>
      <button
        type="button"
        class="text-violet-600 dark:text-violet-400 hover:underline text-xs"
        data-testid="clear-selection"
        @click="clearSelection"
      >
        Clear
      </button>
    </div>

    <!-- Table card -->
    <div
      class="bg-white dark:bg-gray-800 shadow-xs rounded-xl border border-gray-200 dark:border-gray-700/60"
    >
      <!-- Loading state — only the first (list-replacing) load blanks the
           table; appends via infinite scroll keep the loaded rows in place. -->
      <div
        v-if="store.loading && store.storylines.length === 0"
        class="flex items-center justify-center py-16 text-gray-600 dark:text-gray-300"
        data-testid="loading-state"
      >
        <svg
          class="animate-spin w-6 h-6 mr-3 text-violet-500"
          viewBox="0 0 24 24"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <circle
            class="opacity-25"
            cx="12"
            cy="12"
            r="10"
            stroke="currentColor"
            stroke-width="4"
          />
          <path
            class="opacity-75"
            fill="currentColor"
            d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"
          />
        </svg>
        Loading…
      </div>

      <!-- Empty state -->
      <div
        v-else-if="store.storylines.length === 0"
        class="py-16 text-center text-gray-600 dark:text-gray-300"
        data-testid="empty-state"
      >
        No storylines yet. Click "New storyline" above, or seed one via the MCP
        tools (<code>journal_create_storyline</code>) or the
        <code>POST /api/storylines</code> endpoint to get started.
      </div>

      <template v-else>
        <!-- Table: tablet & desktop -->
        <div class="hidden sm:block overflow-x-auto">
          <table class="table-auto w-full dark:text-gray-300">
            <thead
              class="text-xs font-semibold uppercase text-gray-600 dark:text-gray-300 bg-gray-50 dark:bg-gray-700/50 border-b border-gray-200 dark:border-gray-700/60"
            >
              <tr>
                <th class="px-2 py-3 w-8">
                  <input
                    type="checkbox"
                    :checked="allOnPageSelected"
                    class="form-checkbox h-4 w-4 text-violet-500 rounded border-gray-300 dark:border-gray-600"
                    data-testid="select-all-checkbox"
                    @change="toggleSelectAllOnPage"
                    @click.stop
                  />
                </th>
                <th
                  class="px-4 py-3 whitespace-nowrap cursor-pointer hover:text-gray-700 dark:hover:text-gray-200 select-none text-left"
                  data-testid="sort-name"
                  @click="toggleSort('name')"
                >
                  Name{{ sortIndicator('name') }}
                </th>
                <th
                  class="px-4 py-3 whitespace-nowrap cursor-pointer hover:text-gray-700 dark:hover:text-gray-200 select-none text-left"
                  data-testid="sort-anchors"
                  @click="toggleSort('anchors')"
                >
                  Anchors{{ sortIndicator('anchors') }}
                </th>
                <th
                  class="px-4 py-3 whitespace-nowrap cursor-pointer hover:text-gray-700 dark:hover:text-gray-200 select-none text-left"
                  data-testid="sort-updated"
                  @click="toggleSort('updated_at')"
                >
                  Updated{{ sortIndicator('updated_at') }}
                </th>
                <th
                  class="px-4 py-3 whitespace-nowrap cursor-pointer hover:text-gray-700 dark:hover:text-gray-200 select-none text-left"
                  data-testid="sort-created"
                  @click="toggleSort('created_at')"
                >
                  Created{{ sortIndicator('created_at') }}
                </th>
                <th
                  class="px-4 py-3 whitespace-nowrap select-none text-right"
                  data-testid="col-actions"
                >
                  Actions
                </th>
              </tr>
            </thead>
            <tbody
              class="text-sm divide-y divide-gray-200 dark:divide-gray-700/60"
            >
              <tr
                v-for="storyline in sortedStorylines"
                :key="storyline.id"
                class="cursor-pointer hover:bg-violet-50 dark:hover:bg-violet-500/[0.08] transition-colors"
                :class="{
                  'bg-violet-50/50 dark:bg-violet-500/5': isSelected(
                    storyline.id,
                  ),
                }"
                data-testid="storyline-row"
                @click="onRowClick(storyline.id)"
              >
                <td class="px-2 py-3 text-center">
                  <input
                    type="checkbox"
                    :checked="isSelected(storyline.id)"
                    class="form-checkbox h-4 w-4 text-violet-500 rounded border-gray-300 dark:border-gray-600"
                    data-testid="storyline-checkbox"
                    @click.stop
                    @change="toggleSelect(storyline.id)"
                  />
                </td>
                <td
                  class="px-4 py-3 whitespace-nowrap text-gray-800 dark:text-gray-100 font-medium"
                  data-testid="storyline-name-cell"
                >
                  {{ storyline.name }}
                  <span
                    v-if="storyline.unread_count > 0"
                    class="ml-2 inline-flex items-center justify-center rounded-full bg-violet-500 text-white text-[10px] font-semibold px-1.5 py-0.5 align-middle"
                    data-testid="storyline-unread-badge"
                    :aria-label="`${storyline.unread_count} unread chapters`"
                  >
                    {{ storyline.unread_count }}
                  </span>
                </td>
                <td
                  class="px-4 py-3 text-gray-600 dark:text-gray-300"
                  data-testid="storyline-anchors-cell"
                >
                  <div class="flex flex-wrap gap-1">
                    <RouterLink
                      v-for="anchor in storyline.anchors"
                      :key="anchor.entity_id"
                      :to="`/entities/${anchor.entity_id}`"
                      class="inline-block bg-violet-50 dark:bg-violet-500/10 border border-violet-200 dark:border-violet-700/40 rounded-full px-2 py-0.5 text-xs text-violet-700 dark:text-violet-300 hover:underline"
                      :data-testid="`storyline-anchor-chip-${anchor.entity_id}`"
                      @click.stop
                    >
                      {{ anchor.canonical_name || `#${anchor.entity_id}` }}
                    </RouterLink>
                    <span
                      v-if="storyline.anchors.length === 0"
                      class="text-xs text-gray-400"
                    >
                      (none)
                    </span>
                  </div>
                </td>
                <td
                  class="px-4 py-3 whitespace-nowrap text-gray-600 dark:text-gray-300"
                  data-testid="storyline-updated-cell"
                >
                  {{ formatDateTime(storyline.updated_at) }}
                </td>
                <td
                  class="px-4 py-3 whitespace-nowrap text-gray-600 dark:text-gray-300"
                >
                  {{ formatDate(storyline.created_at) }}
                </td>
                <td class="px-4 py-3 whitespace-nowrap text-right space-x-2">
                  <button
                    type="button"
                    class="text-xs text-red-600 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300"
                    data-testid="row-delete-button"
                    :title="`Delete ${storyline.name}`"
                    @click.stop="onDeleteRow(storyline)"
                  >
                    Delete
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <!-- Cards: mobile (stacked) -->
        <ul class="sm:hidden divide-y divide-gray-200 dark:divide-gray-700/60">
          <li
            v-for="storyline in sortedStorylines"
            :key="storyline.id"
            class="p-4 cursor-pointer hover:bg-violet-50 dark:hover:bg-violet-500/[0.08] transition-colors"
            :class="{
              'bg-violet-50/50 dark:bg-violet-500/5': isSelected(storyline.id),
            }"
            data-testid="storyline-card"
            @click="onRowClick(storyline.id)"
          >
            <div class="flex items-start gap-3">
              <input
                type="checkbox"
                :checked="isSelected(storyline.id)"
                class="form-checkbox h-4 w-4 mt-0.5 shrink-0 text-violet-500 rounded border-gray-300 dark:border-gray-600"
                data-testid="storyline-card-checkbox"
                @click.stop
                @change="toggleSelect(storyline.id)"
              />
              <div class="min-w-0 flex-1">
                <div
                  class="text-gray-800 dark:text-gray-100 font-medium"
                  data-testid="storyline-card-name"
                >
                  {{ storyline.name }}
                  <span
                    v-if="storyline.unread_count > 0"
                    class="ml-2 inline-flex items-center justify-center rounded-full bg-violet-500 text-white text-[10px] font-semibold px-1.5 py-0.5 align-middle"
                    data-testid="storyline-card-unread-badge"
                  >
                    {{ storyline.unread_count }}
                  </span>
                </div>

                <!-- Anchors -->
                <div class="mt-2 flex flex-wrap gap-1">
                  <RouterLink
                    v-for="anchor in storyline.anchors"
                    :key="anchor.entity_id"
                    :to="`/entities/${anchor.entity_id}`"
                    class="inline-block bg-violet-50 dark:bg-violet-500/10 border border-violet-200 dark:border-violet-700/40 rounded-full px-2 py-0.5 text-xs text-violet-700 dark:text-violet-300 hover:underline"
                    :data-testid="`storyline-card-anchor-chip-${anchor.entity_id}`"
                    @click.stop
                  >
                    {{ anchor.canonical_name || `#${anchor.entity_id}` }}
                  </RouterLink>
                  <span
                    v-if="storyline.anchors.length === 0"
                    class="text-xs text-gray-400"
                  >
                    (none)
                  </span>
                </div>

                <!-- Meta -->
                <div class="mt-2 text-xs text-gray-500 dark:text-gray-400">
                  Updated
                  {{ formatDateTime(storyline.updated_at) }} · Created
                  {{ formatDate(storyline.created_at) }}
                </div>

                <!-- Actions -->
                <div class="mt-3 flex items-center gap-4">
                  <button
                    type="button"
                    class="text-xs font-medium text-red-600 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300"
                    data-testid="card-delete-button"
                    :title="`Delete ${storyline.name}`"
                    @click.stop="onDeleteRow(storyline)"
                  >
                    Delete
                  </button>
                </div>
              </div>
            </div>
          </li>
        </ul>
      </template>

      <!-- Infinite scroll: count caption + sentinel + manual "Load more" -->
      <div
        v-if="store.storylines.length > 0"
        class="flex flex-col items-center gap-3 px-4 py-4 border-t border-gray-200 dark:border-gray-700/60 text-sm text-gray-600 dark:text-gray-300"
      >
        <div data-testid="storylines-count-caption">
          showing {{ store.storylines.length }} of {{ store.total }}
        </div>
        <button
          v-if="store.hasMore"
          class="btn bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700/60 text-gray-600 dark:text-gray-300 disabled:opacity-50 disabled:cursor-not-allowed"
          :disabled="!canLoadMore"
          data-testid="storylines-load-more"
          @click="loadMore"
        >
          {{ store.loading ? 'Loading…' : 'Load more' }}
        </button>
        <!-- Bottom sentinel: intersects → auto-append when scrolled into view. -->
        <div ref="sentinelRef" data-testid="storylines-scroll-sentinel"></div>
      </div>
    </div>

    <StorylineCreateModal v-model="createModalOpen" @created="onCreated" />
  </div>
</template>
