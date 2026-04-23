<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useEntriesStore } from '@/stores/entries'
import { fetchPreferences, updatePreferences } from '@/api/preferences'
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
  | 'language'
  | 'updated_at'
  | 'entity_mention_count'
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

// Column definitions
interface ColumnDef {
  key: string
  label: string
  defaultVisible: boolean
  align: 'left' | 'center' | 'right'
  sortTestId: string
}

const COLUMNS: ColumnDef[] = [
  {
    key: 'entry_date',
    label: 'Date',
    defaultVisible: true,
    align: 'left',
    sortTestId: 'sort-date',
  },
  {
    key: 'source_type',
    label: 'Source',
    defaultVisible: true,
    align: 'left',
    sortTestId: 'sort-source',
  },
  {
    key: 'created_at',
    label: 'Ingested',
    defaultVisible: true,
    align: 'left',
    sortTestId: 'sort-ingested',
  },
  {
    key: 'uncertain_span_count',
    label: 'Doubts',
    defaultVisible: true,
    align: 'center',
    sortTestId: 'sort-doubts',
  },
  {
    key: 'word_count',
    label: 'Words',
    defaultVisible: true,
    align: 'right',
    sortTestId: 'sort-words',
  },
  {
    key: 'page_count',
    label: 'Pages',
    defaultVisible: true,
    align: 'center',
    sortTestId: 'sort-pages',
  },
  {
    key: 'chunk_count',
    label: 'Chunks',
    defaultVisible: false,
    align: 'right',
    sortTestId: 'sort-chunks',
  },
  {
    key: 'language',
    label: 'Language',
    defaultVisible: false,
    align: 'left',
    sortTestId: 'sort-language',
  },
  {
    key: 'updated_at',
    label: 'Modified',
    defaultVisible: false,
    align: 'left',
    sortTestId: 'sort-modified',
  },
  {
    key: 'entity_mention_count',
    label: 'Entities',
    defaultVisible: false,
    align: 'right',
    sortTestId: 'sort-entities',
  },
]

const COLUMN_MAP: Record<string, ColumnDef> = Object.fromEntries(
  COLUMNS.map((c) => [c.key, c]),
)

const ALIGN_CLASSES: Record<string, string> = {
  left: 'text-left',
  center: 'text-center',
  right: 'text-right',
}

// Column visibility and order — persisted to server via user preferences
const DEFAULT_VISIBILITY = Object.fromEntries(
  COLUMNS.map((c) => [c.key, c.defaultVisible]),
)
const DEFAULT_ORDER = COLUMNS.map((c) => c.key)

const columnVisibility = ref<Record<string, boolean>>({ ...DEFAULT_VISIBILITY })
const columnOrder = ref<string[]>([...DEFAULT_ORDER])
const showColumnMenu = ref(false)

function isVisible(key: string): boolean {
  return columnVisibility.value[key] ?? true
}

// Debounced save to server
let _saveTimer: ReturnType<typeof setTimeout> | null = null

function _persistColumnPrefs(): void {
  if (_saveTimer) clearTimeout(_saveTimer)
  _saveTimer = setTimeout(() => {
    updatePreferences({
      entry_list_columns: {
        visibility: columnVisibility.value,
        order: columnOrder.value,
      },
    }).catch(() => {
      // Silent — prefs are still in-memory, will retry on next change.
    })
  }, 500)
}

async function loadColumnPrefs(): Promise<void> {
  try {
    const { preferences } = await fetchPreferences()
    const prefs = preferences.entry_list_columns as
      | { visibility?: Record<string, boolean>; order?: string[] }
      | undefined
    if (prefs) {
      if (prefs.visibility) {
        // Merge with defaults so new columns get their default visibility
        columnVisibility.value = { ...DEFAULT_VISIBILITY, ...prefs.visibility }
      }
      if (prefs.order) {
        const validKeys = new Set(DEFAULT_ORDER)
        const filtered = prefs.order.filter((k: string) => validKeys.has(k))
        const missing = DEFAULT_ORDER.filter((k) => !filtered.includes(k))
        columnOrder.value = [...filtered, ...missing]
      }
    }
  } catch {
    // Preferences endpoint not available — use defaults.
  }
}

function toggleColumn(key: string) {
  columnVisibility.value[key] = !columnVisibility.value[key]
  _persistColumnPrefs()
}

const orderedColumns = computed(() =>
  columnOrder.value.map((key) => COLUMN_MAP[key]).filter(Boolean),
)

const visibleOrderedColumns = computed(() =>
  orderedColumns.value.filter((col) => isVisible(col.key)),
)

// Drag-and-drop state for column reordering
const dragIndex = ref<number | null>(null)
const dragOverIndex = ref<number | null>(null)

function onDragStart(e: DragEvent, index: number) {
  dragIndex.value = index
  if (e.dataTransfer) {
    e.dataTransfer.effectAllowed = 'move'
  }
}

function onDragOver(e: DragEvent, index: number) {
  e.preventDefault()
  if (e.dataTransfer) {
    e.dataTransfer.dropEffect = 'move'
  }
  dragOverIndex.value = index
}

function onDrop(e: DragEvent, index: number) {
  e.preventDefault()
  if (dragIndex.value === null || dragIndex.value === index) return
  const order = [...columnOrder.value]
  const [moved] = order.splice(dragIndex.value, 1)
  order.splice(index, 0, moved)
  columnOrder.value = order
  _persistColumnPrefs()
  dragIndex.value = null
  dragOverIndex.value = null
}

function onDragEnd() {
  dragIndex.value = null
  dragOverIndex.value = null
}

function resetColumns() {
  columnVisibility.value = { ...DEFAULT_VISIBILITY }
  columnOrder.value = [...DEFAULT_ORDER]
  _persistColumnPrefs()
}

// Close column menu on outside click
function onDocumentClick(e: MouseEvent) {
  if (!showColumnMenu.value) return
  const target = e.target as Node
  const container = document.querySelector(
    '[data-testid="columns-button"]',
  )?.parentElement
  if (container && !container.contains(target)) {
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
  loadColumnPrefs()
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

// Cell rendering helpers
function cellValue(col: ColumnDef, entry: EntrySummary): string {
  switch (col.key) {
    case 'entry_date':
      return formatDate(entry.entry_date)
    case 'source_type':
      return sourceLabel(entry.source_type)
    case 'created_at':
      return formatDateTime(entry.created_at)
    case 'uncertain_span_count':
      return String(entry.uncertain_span_count)
    case 'word_count':
      return entry.word_count.toLocaleString()
    case 'page_count':
      return String(entry.page_count)
    case 'chunk_count':
      return String(entry.chunk_count)
    case 'language':
      return entry.language?.toUpperCase() ?? ''
    case 'updated_at':
      return formatDateTime(entry.updated_at)
    case 'entity_mention_count':
      return String(entry.entity_mention_count)
    default:
      return ''
  }
}

function cellClasses(col: ColumnDef, entry: EntrySummary): string {
  const align = ALIGN_CLASSES[col.align]
  switch (col.key) {
    case 'entry_date':
      return `${align} text-gray-800 dark:text-gray-100 font-medium`
    case 'source_type':
    case 'created_at':
    case 'language':
    case 'updated_at':
      return `${align} text-gray-600 dark:text-gray-300`
    case 'uncertain_span_count':
      return `${align} font-medium ${doubtsColor(entry.uncertain_span_count)}`
    default:
      return align
  }
}

function cellTestId(col: ColumnDef): string | undefined {
  if (col.key === 'source_type') return 'source-cell'
  if (col.key === 'uncertain_span_count') return 'doubts-cell'
  return undefined
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
          class="text-sm text-gray-600 dark:text-gray-300"
          data-testid="entry-count"
        >
          {{ store.total }} entries
        </div>

        <!-- Column visibility and order menu -->
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
            class="absolute right-0 mt-1 w-56 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700/60 rounded-lg shadow-lg z-40 py-1"
            data-testid="columns-menu"
          >
            <div
              v-for="(col, index) in orderedColumns"
              :key="col.key"
              class="flex items-center gap-2 px-3 py-1.5 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700/50"
              :class="{
                'border-t-2 border-violet-400':
                  dragOverIndex === index &&
                  dragIndex !== null &&
                  dragIndex !== index,
                'opacity-50': dragIndex === index,
              }"
              draggable="true"
              :data-testid="`col-item-${col.key}`"
              @dragstart="onDragStart($event, index)"
              @dragover="onDragOver($event, index)"
              @drop="onDrop($event, index)"
              @dragend="onDragEnd"
            >
              <!-- Drag handle for column reordering -->
              <svg
                class="w-4 h-4 text-gray-400 cursor-grab shrink-0"
                data-testid="drag-handle"
                fill="currentColor"
                viewBox="0 0 24 24"
              >
                <circle cx="9" cy="5" r="1.5" />
                <circle cx="15" cy="5" r="1.5" />
                <circle cx="9" cy="12" r="1.5" />
                <circle cx="15" cy="12" r="1.5" />
                <circle cx="9" cy="19" r="1.5" />
                <circle cx="15" cy="19" r="1.5" />
              </svg>
              <label class="flex items-center gap-2 cursor-pointer flex-1">
                <input
                  type="checkbox"
                  :checked="isVisible(col.key)"
                  class="form-checkbox rounded text-violet-500"
                  :data-testid="`col-toggle-${col.key}`"
                  @change="toggleColumn(col.key)"
                />
                {{ col.label }}
              </label>
            </div>
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
        v-else-if="store.entries.length === 0"
        class="py-16 text-center text-gray-600 dark:text-gray-300"
        data-testid="empty-state"
      >
        No journal entries found.
      </div>

      <!-- Entry table with user-configurable column visibility and order -->
      <div v-else class="overflow-x-auto">
        <table class="table-auto w-full dark:text-gray-300">
          <thead
            class="text-xs font-semibold uppercase text-gray-600 dark:text-gray-300 bg-gray-50 dark:bg-gray-700/50 border-b border-gray-200 dark:border-gray-700/60"
          >
            <tr>
              <th
                v-for="col in visibleOrderedColumns"
                :key="col.key"
                class="px-4 py-3 whitespace-nowrap cursor-pointer hover:text-gray-700 dark:hover:text-gray-200 select-none"
                :class="ALIGN_CLASSES[col.align]"
                :data-testid="col.sortTestId"
                @click="toggleSort(col.key as SortKey)"
              >
                {{ col.label }}{{ sortIndicator(col.key as SortKey) }}
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
                v-for="col in visibleOrderedColumns"
                :key="col.key"
                class="px-4 py-3 whitespace-nowrap"
                :class="cellClasses(col, entry)"
                :data-testid="cellTestId(col)"
              >
                {{ cellValue(col, entry) }}
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
  </div>
</template>
