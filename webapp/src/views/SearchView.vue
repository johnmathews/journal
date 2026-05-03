<script setup lang="ts">
import { computed, ref } from 'vue'
import { useSearchStore } from '@/stores/search'
import { renderSnippetHtml } from '@/utils/searchSnippet'
import {
  SEARCH_RANGE_OPTIONS,
  presetToDates,
  type SearchRangePreset,
} from '@/utils/dateRange'
import type { SearchResultItem, SearchSort } from '@/types/search'

const store = useSearchStore()

// Local form state — bound to inputs and pushed into the store only
// when the user submits. This keeps every keystroke from firing a
// request and lets the existing result set stay visible while the
// user refines a query.
const queryInput = ref(store.query)
const startDateInput = ref(store.startDate ?? '')
const endDateInput = ref(store.endDate ?? '')
const sortInput = ref<SearchSort>(store.sort)

// "All time" is the natural default — empty date inputs mean
// "unbounded" on the server, so resuming with an empty store maps
// cleanly to the preset.
const rangePreset = ref<SearchRangePreset>(
  startDateInput.value || endDateInput.value ? 'custom' : 'all',
)

function applyPreset(preset: SearchRangePreset): void {
  rangePreset.value = preset
  if (preset === 'custom') {
    return // leave whatever the user typed alone
  }
  const { from, to } = presetToDates(preset)
  startDateInput.value = from ?? ''
  endDateInput.value = to ?? ''
}

// User-edited dates flip the preset to "custom" so the dropdown
// stays honest about what's actually being submitted.
function onDateInput(): void {
  if (rangePreset.value !== 'custom') {
    rangePreset.value = 'custom'
  }
}

function submit(): void {
  store.runSearch({
    q: queryInput.value,
    start_date: startDateInput.value || null,
    end_date: endDateInput.value || null,
    sort: sortInput.value,
    offset: 0,
  })
}

function nextPage(): void {
  store.runSearch({ offset: store.offset + store.limit })
}

function prevPage(): void {
  const next = Math.max(0, store.offset - store.limit)
  store.runSearch({ offset: next })
}

// Hybrid mode doesn't know the total count, so we infer "might have
// more" from "the server returned exactly `limit` items".
const canNext = computed(
  () => store.items.length === store.limit && store.items.length > 0,
)
const canPrev = computed(() => store.offset > 0)
const currentPage = computed(
  () => Math.floor(store.offset / Math.max(1, store.limit)) + 1,
)

/**
 * Pick the best display text for a single result row.
 *
 * Hybrid results carry `snippet` (BM25-marked excerpt) when BM25
 * contributed and `matching_chunks` (dense top hits) when dense
 * contributed. At least one of those is always present, since a
 * result that neither retriever produced would not have made it
 * into the response. Prefer the snippet — it's a focused excerpt
 * around matched terms — and fall back to the top dense chunk.
 */
function displayHtml(item: SearchResultItem): string {
  if (item.snippet) {
    return renderSnippetHtml(item.snippet)
  }
  return renderSnippetHtml(item.matching_chunks[0].text)
}

function topChunkIndex(item: SearchResultItem): number | null {
  const top = item.matching_chunks[0]
  return top?.chunk_index ?? null
}

function scorePercent(score: number): string {
  // Clamp and round — server-side scores can have trailing
  // floating-point fuzz.
  const pct = Math.max(0, Math.min(100, Math.round(score * 100)))
  return `${pct}%`
}

/**
 * Build a short, human-readable explanation of WHY a result matched.
 * Hybrid results may match via keywords, semantic similarity, or
 * both — surface that to the user so the ranking feels less opaque.
 * Only invoked from the template guarded by the same lex||sem check,
 * so the "neither" case isn't reachable here.
 */
function matchExplanation(item: SearchResultItem): string {
  const lex = !!item.snippet
  const sem = item.matching_chunks.length > 0
  if (lex && sem) {
    return 'Matched by keywords and meaning'
  }
  return lex ? 'Matched by keywords' : 'Matched by meaning'
}
</script>

<template>
  <div data-testid="search-view">
    <div class="mb-6 flex flex-wrap items-center justify-between gap-3">
      <h1
        class="text-2xl md:text-3xl text-gray-800 dark:text-gray-100 font-bold"
      >
        Search
      </h1>
    </div>

    <!-- Query form -->
    <form
      class="mb-4 flex flex-wrap items-end gap-3"
      data-testid="search-form"
      @submit.prevent="submit"
    >
      <div class="grow min-w-[16rem]">
        <label
          class="block text-xs uppercase text-gray-600 dark:text-gray-300 font-semibold mb-1"
          for="search-query"
          >Query</label
        >
        <input
          id="search-query"
          v-model="queryInput"
          type="search"
          placeholder="Search your journal…"
          data-testid="search-query-input"
          class="form-input w-full text-sm bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700/60 rounded-md"
        />
      </div>
      <div>
        <label
          class="block text-xs uppercase text-gray-600 dark:text-gray-300 font-semibold mb-1"
          for="search-range"
          >Range</label
        >
        <select
          id="search-range"
          :value="rangePreset"
          data-testid="search-range-preset"
          class="form-select text-sm bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700/60 rounded-md"
          @change="
            applyPreset(
              ($event.target as HTMLSelectElement).value as SearchRangePreset,
            )
          "
        >
          <option
            v-for="opt in SEARCH_RANGE_OPTIONS"
            :key="opt.value"
            :value="opt.value"
          >
            {{ opt.label }}
          </option>
        </select>
      </div>
      <div>
        <label
          class="block text-xs uppercase text-gray-600 dark:text-gray-300 font-semibold mb-1"
          for="search-start"
          >From</label
        >
        <input
          id="search-start"
          v-model="startDateInput"
          type="date"
          data-testid="search-start-date"
          class="form-input text-sm bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700/60 rounded-md"
          @input="onDateInput"
        />
      </div>
      <div>
        <label
          class="block text-xs uppercase text-gray-600 dark:text-gray-300 font-semibold mb-1"
          for="search-end"
          >To</label
        >
        <input
          id="search-end"
          v-model="endDateInput"
          type="date"
          data-testid="search-end-date"
          class="form-input text-sm bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700/60 rounded-md"
          @input="onDateInput"
        />
      </div>
      <div>
        <label
          class="block text-xs uppercase text-gray-600 dark:text-gray-300 font-semibold mb-1"
          for="search-sort"
          >Sort</label
        >
        <select
          id="search-sort"
          v-model="sortInput"
          data-testid="search-sort"
          class="form-select text-sm bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700/60 rounded-md"
        >
          <option value="relevance">Relevance</option>
          <option value="date_desc">Newest first</option>
          <option value="date_asc">Oldest first</option>
        </select>
      </div>
      <button
        type="submit"
        class="btn bg-violet-500 hover:bg-violet-600 text-white"
        data-testid="search-submit"
      >
        Search
      </button>
    </form>

    <!-- Loading / error / empty states -->
    <div
      v-if="store.loading && !store.hasResults"
      class="py-16 text-center text-gray-600 dark:text-gray-300"
      data-testid="loading-state"
    >
      Searching…
    </div>

    <div
      v-else-if="store.error"
      class="mb-4 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 border border-red-200 dark:border-red-800/40 rounded-lg px-4 py-3 text-sm"
      data-testid="error-banner"
    >
      {{ store.error }}
    </div>

    <div
      v-else-if="!store.hasRun"
      class="py-16 text-center text-gray-600 dark:text-gray-300"
      data-testid="initial-state"
    >
      Enter a query above to search your journal.
    </div>

    <div
      v-else-if="!store.hasResults"
      class="py-16 text-center text-gray-600 dark:text-gray-300"
      data-testid="empty-state"
    >
      No entries matched “{{ store.lastRunQuery }}”.
    </div>

    <!-- Results list -->
    <ul v-else class="space-y-3" data-testid="search-results">
      <li
        v-for="item in store.items"
        :key="item.entry_id"
        class="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700/60 rounded-xl shadow-xs px-4 py-3"
        data-testid="search-result-row"
      >
        <div class="flex items-center justify-between mb-1">
          <RouterLink
            :to="{
              name: 'entry-detail',
              params: { id: item.entry_id },
              query:
                topChunkIndex(item) !== null
                  ? { chunk: String(topChunkIndex(item)) }
                  : {},
            }"
            class="text-violet-600 dark:text-violet-400 hover:underline font-medium text-sm"
            data-testid="search-result-link"
          >
            {{ item.entry_date }}
          </RouterLink>
          <span
            class="inline-block text-xs font-mono text-gray-600 dark:text-gray-300"
            data-testid="search-result-score"
          >
            {{ scorePercent(item.score) }}
          </span>
        </div>
        <!-- eslint-disable vue/no-v-html -->
        <!-- Safe: `displayHtml` routes every piece of text through
             `renderSnippetHtml`, which HTML-escapes all user content
             before wrapping matched terms in `<mark>` tags. The only
             non-escaped markup in the output is the fixed `<mark>`
             element itself. -->
        <div
          class="text-sm text-gray-700 dark:text-gray-200 whitespace-pre-wrap leading-relaxed"
          data-testid="search-result-snippet"
          v-html="displayHtml(item)"
        ></div>
        <!-- eslint-enable vue/no-v-html -->

        <!-- "Why this matched" panel — surfaces lexical vs. semantic
             contribution. A hybrid result can carry both signals. -->
        <div
          v-if="item.snippet || item.matching_chunks.length > 0"
          class="mt-2 pt-2 border-t border-gray-100 dark:border-gray-700/40"
          data-testid="match-explanation"
        >
          <span
            class="text-xs font-medium text-violet-500 dark:text-violet-400"
          >
            {{ matchExplanation(item) }}
          </span>
          <span
            v-if="item.matching_chunks.length > 0"
            class="text-xs text-gray-600 dark:text-gray-300 ml-1"
          >
            — top passage similarity
            {{ scorePercent(item.matching_chunks[0].score) }}
          </span>
          <ul
            v-if="item.matching_chunks.length > 1"
            class="mt-1 space-y-1"
            data-testid="match-extra-chunks"
          >
            <li
              v-for="(chunk, idx) in item.matching_chunks.slice(1, 3)"
              :key="idx"
              class="text-xs text-gray-600 dark:text-gray-300 pl-3 border-l-2 border-gray-200 dark:border-gray-700/60 line-clamp-2"
            >
              {{ scorePercent(chunk.score) }} — {{ chunk.text.slice(0, 150)
              }}{{ chunk.text.length > 150 ? '…' : '' }}
            </li>
          </ul>
        </div>
      </li>
    </ul>

    <!-- Pagination (bottom of results) -->
    <div
      v-if="store.hasResults"
      class="mt-4 flex items-center justify-between text-sm text-gray-600 dark:text-gray-300"
    >
      <div data-testid="search-page-info">Page {{ currentPage }}</div>
      <div class="flex gap-2">
        <button
          class="btn bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700/60 text-gray-600 dark:text-gray-300 disabled:opacity-50 disabled:cursor-not-allowed"
          :disabled="!canPrev"
          data-testid="search-prev-page"
          @click="prevPage"
        >
          Previous
        </button>
        <button
          class="btn bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700/60 text-gray-600 dark:text-gray-300 disabled:opacity-50 disabled:cursor-not-allowed"
          :disabled="!canNext"
          data-testid="search-next-page"
          @click="nextPage"
        >
          Next
        </button>
      </div>
    </div>
  </div>
</template>
