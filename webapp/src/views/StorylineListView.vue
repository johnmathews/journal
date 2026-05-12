<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useStorylinesStore } from '@/stores/storylines'
import type { StorylineSummary } from '@/types/storyline'

const router = useRouter()
const store = useStorylinesStore()

const rows = ref(20)
const first = ref(0)

type SortKey = 'name' | 'last_generated_at' | 'created_at' | 'entity_id'
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

const sortedStorylines = computed(() => {
  const items = [...store.storylines]
  const key = sortKey.value
  const dir = sortAsc.value ? 1 : -1
  return items.sort((a: StorylineSummary, b: StorylineSummary) => {
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
        v-else-if="store.storylines.length === 0"
        class="py-16 text-center text-gray-600 dark:text-gray-300"
        data-testid="empty-state"
      >
        No storylines yet. Seed one via the MCP tools
        (<code>journal_create_storyline</code>) or the
        <code>POST /api/storylines</code> endpoint to get started.
      </div>

      <!-- Table -->
      <div v-else class="overflow-x-auto">
        <table class="table-auto w-full dark:text-gray-300">
          <thead
            class="text-xs font-semibold uppercase text-gray-600 dark:text-gray-300 bg-gray-50 dark:bg-gray-700/50 border-b border-gray-200 dark:border-gray-700/60"
          >
            <tr>
              <th
                class="px-4 py-3 whitespace-nowrap cursor-pointer hover:text-gray-700 dark:hover:text-gray-200 select-none text-left"
                data-testid="sort-name"
                @click="toggleSort('name')"
              >
                Name{{ sortIndicator('name') }}
              </th>
              <th
                class="px-4 py-3 whitespace-nowrap cursor-pointer hover:text-gray-700 dark:hover:text-gray-200 select-none text-left"
                data-testid="sort-entity"
                @click="toggleSort('entity_id')"
              >
                Entity{{ sortIndicator('entity_id') }}
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
            </tr>
          </thead>
          <tbody
            class="text-sm divide-y divide-gray-200 dark:divide-gray-700/60"
          >
            <tr
              v-for="storyline in sortedStorylines"
              :key="storyline.id"
              class="cursor-pointer hover:bg-violet-50 dark:hover:bg-violet-500/[0.08] transition-colors"
              data-testid="storyline-row"
              @click="onRowClick(storyline.id)"
            >
              <td
                class="px-4 py-3 whitespace-nowrap text-gray-800 dark:text-gray-100 font-medium"
                data-testid="storyline-name-cell"
              >
                {{ storyline.name }}
              </td>
              <td
                class="px-4 py-3 whitespace-nowrap text-gray-600 dark:text-gray-300"
              >
                <RouterLink
                  :to="`/entities/${storyline.entity_id}`"
                  class="text-violet-600 dark:text-violet-400 hover:underline"
                  data-testid="storyline-entity-link"
                  @click.stop
                >
                  #{{ storyline.entity_id }}
                </RouterLink>
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
            </tr>
          </tbody>
        </table>
      </div>

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
  </div>
</template>
