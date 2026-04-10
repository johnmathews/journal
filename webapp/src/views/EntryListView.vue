<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useEntriesStore } from '@/stores/entries'

const router = useRouter()
const store = useEntriesStore()

const rows = ref(20)
const first = ref(0)

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
      <div
        v-if="store.total > 0"
        class="text-sm text-gray-500 dark:text-gray-400"
        data-testid="entry-count"
      >
        {{ store.total }} entries
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

      <!-- Table -->
      <div v-else class="overflow-x-auto">
        <table class="table-auto w-full dark:text-gray-300">
          <thead
            class="text-xs font-semibold uppercase text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-gray-700/50 border-b border-gray-200 dark:border-gray-700/60"
          >
            <tr>
              <th class="px-4 py-3 whitespace-nowrap text-left">Date</th>
              <th class="px-4 py-3 whitespace-nowrap text-center">Pages</th>
              <th class="px-4 py-3 whitespace-nowrap text-right">Words</th>
              <th class="px-4 py-3 whitespace-nowrap text-right">Chunks</th>
              <th class="px-4 py-3 whitespace-nowrap text-left">Ingested</th>
            </tr>
          </thead>
          <tbody
            class="text-sm divide-y divide-gray-200 dark:divide-gray-700/60"
          >
            <tr
              v-for="entry in store.entries"
              :key="entry.id"
              class="cursor-pointer hover:bg-violet-50 dark:hover:bg-violet-500/[0.08] transition-colors"
              data-testid="entry-row"
              @click="onRowClick(entry.id)"
            >
              <td
                class="px-4 py-3 whitespace-nowrap text-gray-800 dark:text-gray-100 font-medium"
              >
                {{ formatDate(entry.entry_date) }}
              </td>
              <td class="px-4 py-3 whitespace-nowrap text-center">
                {{ entry.page_count }}
              </td>
              <td class="px-4 py-3 whitespace-nowrap text-right">
                {{ entry.word_count.toLocaleString() }}
              </td>
              <td class="px-4 py-3 whitespace-nowrap text-right">
                {{ entry.chunk_count }}
              </td>
              <td
                class="px-4 py-3 whitespace-nowrap text-gray-500 dark:text-gray-400"
              >
                {{ formatDateTime(entry.created_at) }}
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
