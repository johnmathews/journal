<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useEntriesStore } from '@/stores/entries'
import type { EntrySummary } from '@/types/entry'

const router = useRouter()
const store = useEntriesStore()

const rows = ref(20)
const first = ref(0)

// Sorting state — default: date descending
type SortKey =
  | 'entry_date'
  | 'source_type'
  | 'page_count'
  | 'word_count'
  | 'chunk_count'
  | 'uncertain_span_count'
  | 'created_at'
const sortKey = ref<SortKey>('entry_date')
const sortAsc = ref(false)

function toggleSort(key: SortKey) {
  if (sortKey.value === key) {
    sortAsc.value = !sortAsc.value
  } else {
    sortKey.value = key
    sortAsc.value = key === 'entry_date' ? false : true
  }
}

function sortIndicator(key: SortKey): string {
  if (sortKey.value !== key) return ''
  return sortAsc.value ? ' \u25B2' : ' \u25BC'
}

// Source type labels
const SOURCE_LABELS: Record<string, string> = {
  photo: 'OCR',
  voice: 'Audio',
  text_entry: 'Text',
  imported_text_file: 'File',
  imported_audio_file: 'Audio (file)',
}

function sourceLabel(sourceType: string): string {
  return SOURCE_LABELS[sourceType] ?? sourceType
}

// Column visibility
interface ColumnDef {
  key: string
  label: string
  defaultVisible: boolean
}

const COLUMNS: ColumnDef[] = [
  { key: 'entry_date', label: 'Date', defaultVisible: true },
  { key: 'source_type', label: 'Source', defaultVisible: true },
  { key: 'created_at', label: 'Ingested', defaultVisible: true },
  { key: 'uncertain_span_count', label: 'Doubts', defaultVisible: true },
  { key: 'word_count', label: 'Words', defaultVisible: true },
  { key: 'page_count', label: 'Pages', defaultVisible: true },
  { key: 'chunk_count', label: 'Chunks', defaultVisible: false },
]

const STORAGE_KEY = 'journal-entry-columns'

function loadColumnVisibility(): Record<string, boolean> {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored) return JSON.parse(stored)
  } catch {
    // Corrupted storage — fall through to defaults
  }
  return Object.fromEntries(COLUMNS.map((c) => [c.key, c.defaultVisible]))
}

const columnVisibility = ref<Record<string, boolean>>(loadColumnVisibility())
const showColumnMenu = ref(false)

function isVisible(key: string): boolean {
  return columnVisibility.value[key] ?? true
}

function toggleColumn(key: string) {
  columnVisibility.value[key] = !columnVisibility.value[key]
  localStorage.setItem(STORAGE_KEY, JSON.stringify(columnVisibility.value))
}

function resetColumns() {
  columnVisibility.value = Object.fromEntries(
    COLUMNS.map((c) => [c.key, c.defaultVisible]),
  )
  localStorage.removeItem(STORAGE_KEY)
}

// Close column menu on outside click
function onDocumentClick(e: MouseEvent) {
  const btn = document.querySelector('[data-testid="columns-button"]')
  const menu = document.querySelector('[data-testid="columns-menu"]')
  if (
    showColumnMenu.value &&
    btn &&
    !btn.contains(e.target as Node) &&
    menu &&
    !menu.contains(e.target as Node)
  ) {
    showColumnMenu.value = false
  }
}
onMounted(() => {
  document.addEventListener('click', onDocumentClick)
})
onUnmounted(() => {
  document.removeEventListener('click', onDocumentClick)
})

const sortedEntries = computed(() => {
  const entries = [...store.entries]
  const key = sortKey.value
  const dir = sortAsc.value ? 1 : -1
  return entries.sort((a: EntrySummary, b: EntrySummary) => {
    const av = a[key]
    const bv = b[key]
    if (typeof av === 'string' && typeof bv === 'string') {
      return av.localeCompare(bv) * dir
    }
    return ((av as number) - (bv as number)) * dir
  })
})

onMounted(() => {
  store.loadEntries({ limit: rows.value, offset: 0 })
})

const currentPage = computed(() => Math.floor(first.value / rows.value) + 1)
const totalPages = computed(() =>
  Math.max(1, Math.ceil(store.total / rows.value)),
)

function goToPage(page: number) {
  const target = Math.min(Math.max(1, page), totalPages.value)
  const newFirst = (target - 1) * rows.value
  first.value = newFirst
  store.loadEntries({ limit: rows.value, offset: newFirst })
}

function changeRowsPerPage(event: Event) {
  const target = event.target as HTMLSelectElement
  const value = Number(target.value)
  rows.value = value
  first.value = 0
  store.loadEntries({ limit: value, offset: 0 })
}

function onRowClick(id: number) {
  router.push({ name: 'entry-detail', params: { id } })
}

function formatDate(dateStr: string): string {
  if (!dateStr) return ''
  const date = new Date(dateStr)
  return date.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

function formatDateTime(dateStr: string): string {
  if (!dateStr) return ''
  const date = new Date(dateStr)
  return date.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function doubtsColor(count: number): string {
  if (count === 0) return 'text-emerald-600 dark:text-emerald-400'
  if (count <= 2) return 'text-amber-600 dark:text-amber-400'
  return 'text-red-600 dark:text-red-400'
}
</script>

<template>
  <div class="entry-list" data-testid="entry-list-view">
    <!-- Page header -->
    <div class="sm:flex sm:justify-between sm:items-center mb-8">
      <div class="mb-4 sm:mb-0">
        <h1
          class="text-2xl md:text-3xl text-gray-800 dark:text-gray-100 font-bold"
        >
          Journal Entries
        </h1>
      </div>
      <div class="flex items-center gap-4">
        <div
          v-if="store.total > 0"
          class="text-sm text-gray-500 dark:text-gray-400"
          data-testid="entry-count"
        >
          {{ store.total }} entries
        </div>

        <!-- Column visibility menu -->
        <div class="relative">
          <button
            class="btn bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700/60 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 px-3 py-2 rounded-lg text-sm font-medium flex items-center gap-1.5"
            data-testid="columns-button"
            @click="showColumnMenu = !showColumnMenu"
          >
            <svg
              class="w-4 h-4"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              viewBox="0 0 24 24"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                d="M9 4h6m-6 4h6m-6 4h6m-6 4h6M4 4v16m16-16v16"
              />
            </svg>
            Columns
          </button>
          <div
            v-if="showColumnMenu"
            class="absolute right-0 mt-1 w-48 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700/60 rounded-lg shadow-lg z-40 py-1"
            data-testid="columns-menu"
          >
            <label
              v-for="col in COLUMNS"
              :key="col.key"
              class="flex items-center gap-2 px-3 py-1.5 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700/50 cursor-pointer"
            >
              <input
                type="checkbox"
                :checked="isVisible(col.key)"
                class="form-checkbox rounded text-violet-500"
                :data-testid="`col-toggle-${col.key}`"
                @change="toggleColumn(col.key)"
              />
              {{ col.label }}
            </label>
            <div
              class="border-t border-gray-200 dark:border-gray-700/60 mt-1 pt-1"
            >
              <button
                class="w-full text-left px-3 py-1.5 text-sm text-violet-600 dark:text-violet-400 hover:bg-gray-50 dark:hover:bg-gray-700/50"
                data-testid="columns-reset"
                @click="resetColumns"
              >
                Reset to defaults
              </button>
            </div>
          </div>
        </div>

        <RouterLink
          to="/entries/new"
          class="btn bg-violet-500 hover:bg-violet-600 text-white px-4 py-2 rounded-lg text-sm font-medium"
          data-testid="new-entry-button"
        >
          New Entry
        </RouterLink>
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

    <!-- Table card -->
    <div
      class="bg-white dark:bg-gray-800 shadow-xs rounded-xl border border-gray-200 dark:border-gray-700/60"
    >
      <!-- Loading state -->
      <div
        v-if="store.loading"
        class="flex items-center justify-center py-16 text-gray-500 dark:text-gray-400"
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
        v-else-if="store.entries.length === 0"
        class="py-16 text-center text-gray-500 dark:text-gray-400"
        data-testid="empty-state"
      >
        No journal entries found.
      </div>

      <!-- Entry table with user-configurable column visibility -->
      <div v-else class="overflow-x-auto">
        <table class="table-auto w-full dark:text-gray-300">
          <thead
            class="text-xs font-semibold uppercase text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-gray-700/50 border-b border-gray-200 dark:border-gray-700/60"
          >
            <tr>
              <th
                v-if="isVisible('entry_date')"
                class="px-4 py-3 whitespace-nowrap text-left cursor-pointer hover:text-gray-700 dark:hover:text-gray-200 select-none"
                data-testid="sort-date"
                @click="toggleSort('entry_date')"
              >
                Date{{ sortIndicator('entry_date') }}
              </th>
              <th
                v-if="isVisible('source_type')"
                class="px-4 py-3 whitespace-nowrap text-left cursor-pointer hover:text-gray-700 dark:hover:text-gray-200 select-none"
                data-testid="sort-source"
                @click="toggleSort('source_type')"
              >
                Source{{ sortIndicator('source_type') }}
              </th>
              <th
                v-if="isVisible('created_at')"
                class="px-4 py-3 whitespace-nowrap text-left cursor-pointer hover:text-gray-700 dark:hover:text-gray-200 select-none"
                data-testid="sort-ingested"
                @click="toggleSort('created_at')"
              >
                Ingested{{ sortIndicator('created_at') }}
              </th>
              <th
                v-if="isVisible('uncertain_span_count')"
                class="px-4 py-3 whitespace-nowrap text-center cursor-pointer hover:text-gray-700 dark:hover:text-gray-200 select-none"
                data-testid="sort-doubts"
                @click="toggleSort('uncertain_span_count')"
              >
                Doubts{{ sortIndicator('uncertain_span_count') }}
              </th>
              <th
                v-if="isVisible('word_count')"
                class="px-4 py-3 whitespace-nowrap text-right cursor-pointer hover:text-gray-700 dark:hover:text-gray-200 select-none"
                data-testid="sort-words"
                @click="toggleSort('word_count')"
              >
                Words{{ sortIndicator('word_count') }}
              </th>
              <th
                v-if="isVisible('page_count')"
                class="px-4 py-3 whitespace-nowrap text-center cursor-pointer hover:text-gray-700 dark:hover:text-gray-200 select-none"
                data-testid="sort-pages"
                @click="toggleSort('page_count')"
              >
                Pages{{ sortIndicator('page_count') }}
              </th>
              <th
                v-if="isVisible('chunk_count')"
                class="px-4 py-3 whitespace-nowrap text-right cursor-pointer hover:text-gray-700 dark:hover:text-gray-200 select-none"
                data-testid="sort-chunks"
                @click="toggleSort('chunk_count')"
              >
                Chunks{{ sortIndicator('chunk_count') }}
              </th>
            </tr>
          </thead>
          <tbody
            class="text-sm divide-y divide-gray-200 dark:divide-gray-700/60"
          >
            <tr
              v-for="entry in sortedEntries"
              :key="entry.id"
              class="cursor-pointer hover:bg-violet-50 dark:hover:bg-violet-500/[0.08] transition-colors"
              data-testid="entry-row"
              @click="onRowClick(entry.id)"
            >
              <td
                v-if="isVisible('entry_date')"
                class="px-4 py-3 whitespace-nowrap text-gray-800 dark:text-gray-100 font-medium"
              >
                {{ formatDate(entry.entry_date) }}
              </td>
              <td
                v-if="isVisible('source_type')"
                class="px-4 py-3 whitespace-nowrap text-gray-500 dark:text-gray-400"
                data-testid="source-cell"
              >
                {{ sourceLabel(entry.source_type) }}
              </td>
              <td
                v-if="isVisible('created_at')"
                class="px-4 py-3 whitespace-nowrap text-gray-500 dark:text-gray-400"
              >
                {{ formatDateTime(entry.created_at) }}
              </td>
              <td
                v-if="isVisible('uncertain_span_count')"
                class="px-4 py-3 whitespace-nowrap text-center font-medium"
                :class="doubtsColor(entry.uncertain_span_count)"
                data-testid="doubts-cell"
              >
                {{ entry.uncertain_span_count }}
              </td>
              <td
                v-if="isVisible('word_count')"
                class="px-4 py-3 whitespace-nowrap text-right"
              >
                {{ entry.word_count.toLocaleString() }}
              </td>
              <td
                v-if="isVisible('page_count')"
                class="px-4 py-3 whitespace-nowrap text-center"
              >
                {{ entry.page_count }}
              </td>
              <td
                v-if="isVisible('chunk_count')"
                class="px-4 py-3 whitespace-nowrap text-right"
              >
                {{ entry.chunk_count }}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- Pagination footer -->
      <div
        v-if="!store.loading && store.entries.length > 0"
        class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 px-4 py-3 border-t border-gray-200 dark:border-gray-700/60"
      >
        <div
          class="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400"
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
            class="text-sm text-gray-500 dark:text-gray-400"
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
  </div>
</template>
