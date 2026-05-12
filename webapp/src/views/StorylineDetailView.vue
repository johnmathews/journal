<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useStorage } from '@vueuse/core'
import { useRouter } from 'vue-router'
import { useStorylinesStore } from '@/stores/storylines'
import { useJobsStore } from '@/stores/jobs'
import { useToast } from '@/composables/useToast'
import { isTerminal } from '@/types/job'
import StorylineNarrative from '@/components/StorylineNarrative.vue'
import StorylineCurationList from '@/components/StorylineCurationList.vue'
import { buildCitationRegistry } from '@/composables/useCitationRegistry'

const props = defineProps<{
  id: string
}>()

const router = useRouter()
const store = useStorylinesStore()
const jobsStore = useJobsStore()
const toast = useToast()

const deleting = ref(false)
const deleteError = ref<string | null>(null)

const curationPanel = computed(
  () => store.currentStoryline?.panels.curation ?? null,
)
const narrativePanel = computed(
  () => store.currentStoryline?.panels.narrative ?? null,
)
const citationCount = computed(() => narrativePanel.value?.citation_count ?? 0)

// Shared numbering across both panels. Narrative drives [1] [2] [3] in
// encounter order; curation-only entries pick up the next numbers.
const citationRegistry = computed(() =>
  buildCitationRegistry(store.currentStoryline?.panels ?? {}),
)

// Toggle for the curation panel's first column: 'relative' shows the
// LLM-authored phrase ("Nearly a month later"), 'absolute' shows the
// source entry's ISO date. Persisted so the user's choice survives
// reloads and applies across storylines.
const curationDateMode = useStorage<'relative' | 'absolute'>(
  'storyline:curationDateMode',
  'relative',
)

// Storylines generated before the server stamped citations with
// entry_date have no absolute dates available — switching to
// "Absolute" would silently fall back to the relative label and look
// like a broken toggle. Hide the control entirely on those panels;
// regenerating populates the field and the toggle reappears.
const curationHasAbsoluteDates = computed(() => {
  const segs = curationPanel.value?.segments ?? []
  return segs.some(
    (s) => s.kind === 'citation' && typeof s.entry_date === 'string',
  )
})

function formatDateTime(dateStr: string | null): string {
  if (!dateStr) return 'never'
  return new Date(dateStr).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function goBack(): void {
  router.push({ name: 'storylines' })
}

async function regenerate(): Promise<void> {
  if (!store.currentStoryline) return
  try {
    const { job_id } = await store.regenerate(store.currentStoryline.id)
    jobsStore.trackJob(job_id, 'storyline_generation', {
      storyline_id: store.currentStoryline.id,
    })
    toast.success('Regeneration queued. Refresh once the job finishes.')

    // Refresh the detail when the job lands in a terminal state — at
    // that point the new panels are persisted and we can pull them.
    const sid = store.currentStoryline.id
    const unwatch = watch(
      () => jobsStore.getJobById(job_id),
      (job) => {
        if (job && isTerminal(job.status)) {
          unwatch()
          if (job.status === 'succeeded') {
            store.loadStoryline(sid)
          }
        }
      },
    )
  } catch {
    // store.regenerateError carries the message
  }
}

async function confirmDelete(): Promise<void> {
  if (!store.currentStoryline || deleting.value) return
  const name = store.currentStoryline.name
  const ok = window.confirm(
    `Delete the storyline "${name}"? This removes both panels but the source journal entries are untouched.`,
  )
  if (!ok) return
  deleting.value = true
  deleteError.value = null
  try {
    await store.removeStoryline(store.currentStoryline.id)
    router.push({ name: 'storylines' })
  } catch (e) {
    deleteError.value = e instanceof Error ? e.message : 'Failed to delete'
  } finally {
    deleting.value = false
  }
}

onMounted(() => {
  const sid = Number(props.id)
  // Clear stale detail so transitions between storylines re-fire watchers.
  store.clearCurrent()
  store.loadStoryline(sid)
})
</script>

<template>
  <div class="storyline-detail" data-testid="storyline-detail-view">
    <!-- Loading state -->
    <div
      v-if="store.detailLoading && !store.currentStoryline"
      class="py-16 text-center text-gray-600 dark:text-gray-300"
      data-testid="loading-state"
    >
      Loading storyline…
    </div>

    <!-- Fatal error (no storyline loaded) -->
    <div
      v-else-if="store.error && !store.currentStoryline"
      class="mb-4 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 border border-red-200 dark:border-red-800/40 rounded-lg px-4 py-3 text-sm"
      data-testid="error-banner"
    >
      {{ store.error }}
    </div>

    <template v-else-if="store.currentStoryline">
      <!-- Header -->
      <div class="mb-6">
        <div class="flex flex-wrap items-center justify-between gap-3 mb-2">
          <div class="flex items-center gap-3">
            <button
              class="btn bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700/60 text-gray-600 dark:text-gray-300 hover:text-gray-800 dark:hover:text-gray-100"
              data-testid="back-button"
              @click="goBack"
            >
              <svg class="w-4 h-4 fill-current mr-1" viewBox="0 0 16 16">
                <path d="M9.4 13.4L4 8l5.4-5.4 1.4 1.4L6.8 8l4 4z" />
              </svg>
              Back
            </button>
            <h1
              class="text-2xl md:text-3xl text-gray-800 dark:text-gray-100 font-bold"
              data-testid="storyline-name-heading"
            >
              {{ store.currentStoryline.name }}
            </h1>
          </div>

          <div class="flex items-center gap-2">
            <button
              class="btn bg-white dark:bg-gray-800 border-violet-200 dark:border-violet-800/60 text-violet-600 dark:text-violet-400 hover:bg-violet-50 dark:hover:bg-violet-900/20 disabled:opacity-50 disabled:cursor-not-allowed"
              :disabled="store.regenerating || deleting"
              data-testid="regenerate-button"
              @click="regenerate"
            >
              {{ store.regenerating ? 'Queuing…' : 'Regenerate' }}
            </button>
            <button
              class="btn bg-white dark:bg-gray-800 border-red-200 dark:border-red-800/60 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 disabled:opacity-50 disabled:cursor-not-allowed"
              :disabled="deleting || store.regenerating"
              data-testid="delete-button"
              @click="confirmDelete"
            >
              {{ deleting ? 'Deleting…' : 'Delete' }}
            </button>
          </div>
        </div>

        <!-- Meta strip -->
        <div
          class="flex flex-wrap items-center gap-4 text-sm text-gray-600 dark:text-gray-300"
          data-testid="storyline-meta"
        >
          <RouterLink
            :to="`/entities/${store.currentStoryline.entity_id}`"
            class="text-violet-600 dark:text-violet-400 hover:underline"
            data-testid="storyline-entity-link"
          >
            Entity #{{ store.currentStoryline.entity_id }}
          </RouterLink>
          <span data-testid="storyline-last-generated">
            Last generated:
            {{ formatDateTime(store.currentStoryline.last_generated_at) }}
          </span>
          <span v-if="citationCount > 0" data-testid="storyline-citation-count">
            {{ citationCount }} citation{{ citationCount === 1 ? '' : 's' }}
          </span>
        </div>

        <!-- Regenerate error -->
        <div
          v-if="store.regenerateError"
          class="mt-3 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 border border-red-200 dark:border-red-800/40 rounded-lg px-4 py-3 text-sm"
          data-testid="regenerate-error-banner"
        >
          {{ store.regenerateError }}
        </div>

        <!-- Delete error -->
        <div
          v-if="deleteError"
          class="mt-3 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 border border-red-200 dark:border-red-800/40 rounded-lg px-4 py-3 text-sm"
          data-testid="delete-error-banner"
        >
          {{ deleteError }}
        </div>
      </div>

      <!-- Two-panel layout: stacks below lg (1024px), side-by-side above.
           Mirrors the edit-mode layout in EntryDetailView.vue. Each
           panel scrolls independently; there's no synchronised
           scrolling primitive in v1. -->
      <div class="flex flex-col lg:flex-row gap-4">
        <section
          class="lg:flex-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700/60 rounded-xl shadow-xs p-4 md:p-6"
          data-testid="curation-panel"
        >
          <div class="flex items-center justify-between gap-3 mb-3">
            <h2
              class="text-xs font-semibold uppercase tracking-wider text-gray-600 dark:text-gray-300"
            >
              Curation
            </h2>
            <div
              v-if="curationHasAbsoluteDates"
              class="curation-date-toggle inline-flex rounded-md border border-gray-200 dark:border-gray-700/60 overflow-hidden text-xs"
              role="group"
              aria-label="Date display mode"
              data-testid="curation-date-toggle"
            >
              <button
                type="button"
                class="px-2 py-1 transition-colors"
                :class="
                  curationDateMode === 'relative'
                    ? 'bg-violet-50 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300'
                    : 'bg-white text-gray-500 dark:bg-gray-800 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
                "
                :aria-pressed="curationDateMode === 'relative'"
                data-testid="curation-date-toggle-relative"
                @click="curationDateMode = 'relative'"
              >
                Relative
              </button>
              <button
                type="button"
                class="px-2 py-1 border-l border-gray-200 dark:border-gray-700/60 transition-colors"
                :class="
                  curationDateMode === 'absolute'
                    ? 'bg-violet-50 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300'
                    : 'bg-white text-gray-500 dark:bg-gray-800 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
                "
                :aria-pressed="curationDateMode === 'absolute'"
                data-testid="curation-date-toggle-absolute"
                @click="curationDateMode = 'absolute'"
              >
                Absolute
              </button>
            </div>
          </div>
          <div
            v-if="curationPanel && curationPanel.segments.length > 0"
            class="storyline-panel-body"
          >
            <StorylineCurationList
              :segments="curationPanel.segments"
              :registry="citationRegistry"
              :date-mode="curationDateMode"
            />
          </div>
          <div
            v-else
            class="py-8 text-center text-sm text-gray-500 dark:text-gray-400"
            data-testid="curation-empty"
          >
            No curation segments yet. Regenerate to populate.
          </div>
        </section>

        <section
          class="lg:flex-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700/60 rounded-xl shadow-xs p-4 md:p-6"
          data-testid="narrative-panel"
        >
          <h2
            class="text-xs font-semibold uppercase tracking-wider text-gray-600 dark:text-gray-300 mb-3"
          >
            Narrative
          </h2>
          <div
            v-if="narrativePanel && narrativePanel.segments.length > 0"
            class="storyline-panel-body"
          >
            <StorylineNarrative
              :segments="narrativePanel.segments"
              :registry="citationRegistry"
            />
          </div>
          <div
            v-else
            class="py-8 text-center text-sm text-gray-500 dark:text-gray-400"
            data-testid="narrative-empty"
          >
            No narrative segments yet. Regenerate to populate.
          </div>
        </section>
      </div>
    </template>

    <!-- Fallback when nothing matched (e.g. between mount and load). -->
    <div
      v-else
      class="py-16 text-center text-gray-600 dark:text-gray-300"
      data-testid="loading-state"
    >
      Loading storyline…
    </div>
  </div>
</template>
