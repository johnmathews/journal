<script setup lang="ts">
/**
 * Admin "Moods" tab — read-only inspector for the live mood-dimensions
 * config the server has loaded from `config/mood-dimensions.toml`.
 *
 * Shows the operator-managed version, the per-group plain-English
 * descriptions used as tooltips on the dashboard, and the full notes
 * for each dimension (these are also fed verbatim into the LLM scoring
 * prompt). Editing the toml is intentionally NOT exposed here —
 * changing a facet's notes triggers the LLM-rebackfill workflow which
 * lives at the CLI (`journal backfill-mood --force`).
 */
import { computed, onMounted } from 'vue'
import { useDashboardStore } from '@/stores/dashboard'
import { displayLabel } from '@/utils/mood-display'
import { groupDimensions } from '@/utils/mood-groups'

const store = useDashboardStore()

onMounted(() => {
  // Cheap idempotent fetch — the dashboard store caches dimensions
  // for the session, so navigating between dashboard and admin moods
  // re-uses the same data without a second round-trip.
  void store.loadMoodDimensions()
})

const grouped = computed(() => groupDimensions(store.moodDimensions))

const meta = computed(() => store.moodDimensionsMeta)

const hasDimensions = computed(() => store.moodDimensions.length > 0)
</script>

<template>
  <main
    class="px-4 sm:px-6 lg:px-8 py-8 w-full max-w-5xl mx-auto"
    data-testid="admin-moods-page"
  >
    <!-- Page intro -->
    <header class="mb-6">
      <h2 class="text-lg font-semibold text-gray-800 dark:text-gray-200 mb-2">
        Mood scoring configuration
      </h2>
      <p
        class="text-sm text-gray-600 dark:text-gray-300 leading-relaxed max-w-3xl"
      >
        These are the facets the LLM scores every entry against. The dashboard's
        "Mood Trends" chart renders one line per facet; the groups below are the
        same conceptual buckets you'll see in the chart's toggles. Definitions
        live in
        <code
          class="font-mono text-xs px-1 py-0.5 bg-gray-100 dark:bg-gray-800 rounded"
          >server/config/mood-dimensions.toml</code
        >
        — to change a facet's scoring criteria, edit the file and run
        <code
          class="font-mono text-xs px-1 py-0.5 bg-gray-100 dark:bg-gray-800 rounded"
          >journal backfill-mood --force</code
        >.
      </p>
    </header>

    <!-- Version + description banner -->
    <section
      class="mb-8 p-4 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700/60 rounded-xl shadow-xs"
      data-testid="admin-moods-version-banner"
    >
      <div class="flex items-baseline justify-between gap-4 mb-2">
        <div class="flex items-baseline gap-3">
          <span
            class="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400"
            >Config version</span
          >
          <span
            v-if="meta.version"
            class="font-mono text-sm text-gray-900 dark:text-gray-100"
            data-testid="admin-moods-version"
            >{{ meta.version }}</span
          >
          <span
            v-else
            class="font-mono text-sm text-gray-400 dark:text-gray-500"
            data-testid="admin-moods-version"
            >unknown</span
          >
        </div>
        <span
          v-if="hasDimensions"
          class="text-xs text-gray-500 dark:text-gray-400"
          >{{ store.moodDimensions.length }} facets</span
        >
      </div>
      <p
        v-if="meta.description"
        class="text-sm text-gray-700 dark:text-gray-300 leading-relaxed whitespace-pre-line"
      >
        {{ meta.description }}
      </p>
      <p v-else class="text-sm text-gray-500 dark:text-gray-400 italic">
        No description set in the toml's [meta] block.
      </p>
    </section>

    <!-- Empty state -->
    <div
      v-if="!hasDimensions"
      class="p-6 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700/60 rounded-xl shadow-xs text-sm text-gray-600 dark:text-gray-300"
      data-testid="admin-moods-empty"
    >
      <p class="font-medium text-gray-700 dark:text-gray-200 mb-1">
        Mood scoring isn't enabled
      </p>
      <p>
        Set
        <code
          class="font-mono text-xs px-1 py-0.5 bg-gray-100 dark:bg-gray-700 rounded"
          >JOURNAL_ENABLE_MOOD_SCORING=true</code
        >
        on the server and ensure
        <code
          class="font-mono text-xs px-1 py-0.5 bg-gray-100 dark:bg-gray-700 rounded"
          >config/mood-dimensions.toml</code
        >
        contains at least one
        <code
          class="font-mono text-xs px-1 py-0.5 bg-gray-100 dark:bg-gray-700 rounded"
          >[[dimension]]</code
        >
        block.
      </p>
    </div>

    <!-- One panel per group -->
    <section
      v-for="g in grouped"
      :key="g.group.id"
      class="mb-6 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700/60 rounded-xl shadow-xs overflow-hidden"
      :data-testid="`admin-moods-group-${g.group.id}`"
    >
      <header
        class="px-4 py-3 border-b border-gray-200 dark:border-gray-700/60 bg-gray-50 dark:bg-gray-800/40"
      >
        <h3
          class="text-sm font-semibold uppercase tracking-wide text-gray-800 dark:text-gray-100"
        >
          {{ g.group.label || 'Other' }}
        </h3>
        <p
          v-if="g.group.description"
          class="mt-1 text-sm text-gray-600 dark:text-gray-300 leading-relaxed"
        >
          {{ g.group.description }}
        </p>
      </header>

      <ul
        class="divide-y divide-gray-200 dark:divide-gray-700/60"
        :data-testid="`admin-moods-group-${g.group.id}-dimensions`"
      >
        <li
          v-for="d in g.members"
          :key="d.name"
          class="px-4 py-4"
          :data-testid="`admin-moods-dimension-${d.name}`"
        >
          <div class="flex items-baseline justify-between gap-4 mb-2">
            <div class="flex items-baseline gap-3">
              <span
                class="text-base font-semibold text-gray-900 dark:text-gray-100"
                >{{ displayLabel(d) }}</span
              >
              <code
                class="font-mono text-xs text-gray-500 dark:text-gray-400"
                >{{ d.name }}</code
              >
            </div>
            <span
              class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[0.65rem] font-medium uppercase tracking-wide bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200"
            >
              {{ d.scale_type }}
              <span class="font-mono normal-case">{{
                d.scale_type === 'bipolar' ? '−1..+1' : '0..1'
              }}</span>
            </span>
          </div>
          <div
            class="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-300 mb-2"
          >
            <span class="font-mono">{{ d.positive_pole }}</span>
            <span aria-hidden="true">↔</span>
            <span class="font-mono">{{ d.negative_pole }}</span>
          </div>
          <p
            class="text-sm text-gray-700 dark:text-gray-300 leading-relaxed whitespace-pre-line"
          >
            {{ d.notes }}
          </p>
        </li>
      </ul>
    </section>
  </main>
</template>
