<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useStorylinesStore } from '@/stores/storylines'
import { useToast } from '@/composables/useToast'
import StorylineCreateModal from '@/components/StorylineCreateModal.vue'
import StorylineRegenerateModal from '@/components/StorylineRegenerateModal.vue'
import type { StorylineSummary } from '@/types/storyline'

const router = useRouter()
const store = useStorylinesStore()
const toast = useToast()

const rows = ref(20)
const first = ref(0)

type SortKey = 'name' | 'last_generated_at' | 'created_at' | 'anchors'
const sortKey = ref<SortKey>('last_generated_at')
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

onMounted(() => {
  store.loadStorylines({ limit: rows.value, offset: 0 })
})

const currentPage = computed(() => Math.floor(first.value / rows.value) + 1)
const totalPages = computed(() =>
  Math.max(1, Math.ceil(store.total / rows.value)),
)

function goToPage(page: number): void {
  const target = Math.min(Math.max(1, page), totalPages.value)
  const newFirst = (target - 1) * rows.value
  first.value = newFirst
  store.loadStorylines({ limit: rows.value, offset: newFirst })
}

function changeRowsPerPage(event: Event): void {
  const target = event.target as HTMLSelectElement
  const value = Number(target.value)
  rows.value = value
  first.value = 0
  store.loadStorylines({ limit: value, offset: 0 })
}

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
  // Refresh so the new row is visible. The generation job is already
  // tracked inside the modal — its terminal transition will surface
  // via the global jobs store. Reload once more on a short delay so
  // the freshly-generated panels are reflected the moment the user
  // is likely to look; cheap, and good enough until we add proper
  // job-completion plumbing here.
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

// --- Regenerate (W11) ---
const regenerateModalOpen = ref(false)
const regenerateIds = ref<number[]>([])

function openRegenerateRow(storyline: StorylineSummary): void {
  regenerateIds.value = [storyline.id]
  regenerateModalOpen.value = true
}

function openRegenerateBulk(): void {
  regenerateIds.value = [...selectedIds.value]
  regenerateModalOpen.value = true
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
        class="btn bg-violet-500 hover:bg-violet-600 text-white text-xs py-1"
        data-testid="bulk-regenerate-button"
        @click="openRegenerateBulk"
      >
        Regenerate {{ selectedCount }} selected
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
      <!-- Loading state -->
      <div
        v-if="store.loading"
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
                  data-testid="sort-generated"
                  @click="toggleSort('last_generated_at')"
                >
                  Last generated{{ sortIndicator('last_generated_at') }}
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
                </td>
                <td
                  class="px-4 py-3 text-gray-600 dark:text-gray-300"
                  data-testid="storyline-anchors-cell"
                >
                  <div class="flex flex-wrap gap-1">
                    <RouterLink
                      v-for="anchor in storyline.anchors"
                      :key="anchor.id"
                      :to="`/entities/${anchor.id}`"
                      class="inline-block bg-violet-50 dark:bg-violet-500/10 border border-violet-200 dark:border-violet-700/40 rounded-full px-2 py-0.5 text-xs text-violet-700 dark:text-violet-300 hover:underline"
                      :data-testid="`storyline-anchor-chip-${anchor.id}`"
                      @click.stop
                    >
                      {{ anchor.canonical_name || `#${anchor.id}` }}
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
                  data-testid="storyline-last-generated-cell"
                >
                  {{ formatDateTime(storyline.last_generated_at) }}
                </td>
                <td
                  class="px-4 py-3 whitespace-nowrap text-gray-600 dark:text-gray-300"
                >
                  {{ formatDate(storyline.created_at) }}
                </td>
                <td class="px-4 py-3 whitespace-nowrap text-right space-x-2">
                  <button
                    type="button"
                    class="text-xs text-violet-600 hover:text-violet-700 dark:text-violet-400 dark:hover:text-violet-300"
                    data-testid="row-regenerate-button"
                    :title="`Regenerate ${storyline.name}`"
                    @click.stop="openRegenerateRow(storyline)"
                  >
                    Regenerate
                  </button>
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
                </div>

                <!-- Anchors -->
                <div class="mt-2 flex flex-wrap gap-1">
                  <RouterLink
                    v-for="anchor in storyline.anchors"
                    :key="anchor.id"
                    :to="`/entities/${anchor.id}`"
                    class="inline-block bg-violet-50 dark:bg-violet-500/10 border border-violet-200 dark:border-violet-700/40 rounded-full px-2 py-0.5 text-xs text-violet-700 dark:text-violet-300 hover:underline"
                    :data-testid="`storyline-card-anchor-chip-${anchor.id}`"
                    @click.stop
                  >
                    {{ anchor.canonical_name || `#${anchor.id}` }}
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
                  Last generated
                  {{ formatDateTime(storyline.last_generated_at) }} · Created
                  {{ formatDate(storyline.created_at) }}
                </div>

                <!-- Actions -->
                <div class="mt-3 flex items-center gap-4">
                  <button
                    type="button"
                    class="text-xs font-medium text-violet-600 hover:text-violet-700 dark:text-violet-400 dark:hover:text-violet-300"
                    data-testid="card-regenerate-button"
                    :title="`Regenerate ${storyline.name}`"
                    @click.stop="openRegenerateRow(storyline)"
                  >
                    Regenerate
                  </button>
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

      <!-- Pagination footer -->
      <div
        v-if="!store.loading && store.storylines.length > 0"
        class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 px-4 py-3 border-t border-gray-200 dark:border-gray-700/60"
      >
        <div
          class="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-300"
        >
          <label for="rows-per-page">Rows per page:</label>
          <select
            id="rows-per-page"
            class="form-select text-sm py-1"
            :value="rows"
            @change="changeRowsPerPage"
          >
            <option :value="10">10</option>
            <option :value="20">20</option>
            <option :value="50">50</option>
          </select>
        </div>

        <div class="flex items-center gap-3">
          <span
            class="text-sm text-gray-600 dark:text-gray-300"
            data-testid="page-indicator"
          >
            Page {{ currentPage }} of {{ totalPages }}
          </span>
          <div class="flex gap-1">
            <button
              class="btn btn-sm bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700/60 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
              :disabled="currentPage <= 1"
              data-testid="prev-page"
              @click="goToPage(currentPage - 1)"
            >
              <svg class="w-4 h-4 fill-current" viewBox="0 0 16 16">
                <path d="M9.4 13.4L4 8l5.4-5.4 1.4 1.4L6.8 8l4 4z" />
              </svg>
              <span class="ml-1">Prev</span>
            </button>
            <button
              class="btn btn-sm bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700/60 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
              :disabled="currentPage >= totalPages"
              data-testid="next-page"
              @click="goToPage(currentPage + 1)"
            >
              <span class="mr-1">Next</span>
              <svg class="w-4 h-4 fill-current" viewBox="0 0 16 16">
                <path d="M6.6 13.4L5.2 12l4-4-4-4 1.4-1.4L12 8z" />
              </svg>
            </button>
          </div>
        </div>
      </div>
    </div>

    <StorylineCreateModal v-model="createModalOpen" @created="onCreated" />

    <StorylineRegenerateModal
      v-model="regenerateModalOpen"
      :storyline-ids="regenerateIds"
    />
  </div>
</template>
