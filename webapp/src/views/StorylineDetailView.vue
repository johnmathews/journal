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
import StorylineAnchorEditor from '@/components/StorylineAnchorEditor.vue'
import { buildCitationRegistry } from '@/composables/useCitationRegistry'
import { useBackNavigation } from '@/composables/useBackNavigation'

const props = defineProps<{
  id: string
}>()

const router = useRouter()
const store = useStorylinesStore()
const jobsStore = useJobsStore()
const toast = useToast()

const deleting = ref(false)
const deleteError = ref<string | null>(null)
// Anchor-edit panel toggle (W30). The editor mounts fresh on each
// open (v-if) so its picked set re-seeds from the saved anchors.
const editingAnchors = ref(false)
// Inline title editing. `nameDraft` seeds from the saved name when the
// editor opens; Save trims and PATCHes, Cancel discards.
const editingName = ref(false)
const nameDraft = ref('')

// Panels are read from the currently-selected chapter (loaded lazily
// via store.loadChapter), so the reader shows one chapter at a time and
// citation numbering restarts per chapter.
const curationPanel = computed(
  () => store.currentChapter?.panels.curation ?? null,
)
const narrativePanel = computed(
  () => store.currentChapter?.panels.narrative ?? null,
)
const citationCount = computed(() => narrativePanel.value?.citation_count ?? 0)

// The chapter rail lists the storyline's chapters (seq asc). The latest
// chapter (last element) is the live, open one and is selected by default.
const chapters = computed(() => store.currentStoryline?.chapters ?? [])
const selectedChapterId = ref<number | null>(null)

// Shared numbering across both panels of the CURRENT chapter. Narrative
// drives [1] [2] [3] in encounter order; curation-only entries pick up
// the next numbers. Built per chapter, so numbering restarts on switch.
const citationRegistry = computed(() =>
  buildCitationRegistry(store.currentChapter?.panels ?? {}),
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

const goBack = useBackNavigation({ name: 'storylines' })

function startEditName(): void {
  if (!store.currentStoryline) return
  nameDraft.value = store.currentStoryline.name
  editingName.value = true
}

function cancelEditName(): void {
  editingName.value = false
}

async function saveName(): Promise<void> {
  if (!store.currentStoryline) return
  const trimmed = nameDraft.value.trim()
  if (!trimmed) return
  try {
    await store.renameStoryline(store.currentStoryline.id, trimmed)
    editingName.value = false
    toast.success('Title updated.')
  } catch {
    // store.nameError carries the message; surfaced in the template.
  }
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

/** Post-save hook from the anchor editor. The PUT /anchors endpoint
 * does not regenerate panels server-side, so when the user picked
 * "Save & regenerate" we chain the existing regenerate flow here —
 * exactly one job is kicked, with the usual tracking + refresh. */
async function onAnchorsSaved(payload: { regenerate: boolean }): Promise<void> {
  editingAnchors.value = false
  if (payload.regenerate) {
    toast.success('Anchors updated.')
    await regenerate()
  } else {
    toast.success('Anchors updated. Panels are stale until you regenerate.')
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

/** Select a chapter: lazy-load its panels into the reader and reflect
 *  the choice in the URL (?chapter=<id>) so reloads/links restore it.
 *  Other query params are preserved. */
async function selectChapter(chapterId: number): Promise<void> {
  selectedChapterId.value = chapterId
  await store.loadChapter(Number(props.id), chapterId)
  router.replace({
    query: { ...router.currentRoute.value.query, chapter: String(chapterId) },
  })
}

onMounted(async () => {
  const sid = Number(props.id)
  // Clear stale detail so transitions between storylines re-fire watchers.
  store.clearCurrent()
  await store.loadStoryline(sid)
  // Default-select: honour a valid ?chapter= query, else the latest
  // (highest-seq) chapter — the last element since chapters are seq asc.
  const qp = Number(router.currentRoute.value.query.chapter)
  const fromQuery =
    Number.isInteger(qp) && chapters.value.some((c) => c.id === qp) ? qp : null
  const initial = fromQuery ?? chapters.value[chapters.value.length - 1]?.id
  if (initial != null) {
    await selectChapter(initial)
  }
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
            <template v-if="!editingName">
              <h1
                class="text-2xl md:text-3xl text-gray-800 dark:text-gray-100 font-bold"
                data-testid="storyline-name-heading"
              >
                {{ store.currentStoryline.name }}
              </h1>
              <button
                type="button"
                class="text-gray-400 hover:text-violet-600 dark:hover:text-violet-400"
                data-testid="edit-name-button"
                aria-label="Edit title"
                title="Edit title"
                @click="startEditName"
              >
                <svg class="w-4 h-4 fill-current" viewBox="0 0 16 16">
                  <path
                    d="M11.7.3c-.4-.4-1-.4-1.4 0l-10 10c-.2.2-.3.4-.3.7v4c0 .6.4 1 1 1h4c.3 0 .5-.1.7-.3l10-10c.4-.4.4-1 0-1.4l-4-4zM3.6 14H2v-1.6l6-6L9.6 8l-6 6zM11 6.6L9.4 5 11 3.4 12.6 5 11 6.6z"
                  />
                </svg>
              </button>
            </template>
            <form
              v-else
              class="flex items-center gap-2"
              data-testid="storyline-name-form"
              @submit.prevent="saveName"
            >
              <input
                v-model="nameDraft"
                type="text"
                class="form-input text-xl md:text-2xl font-bold w-64 md:w-96"
                data-testid="storyline-name-input"
                aria-label="Storyline title"
                @keydown.esc="cancelEditName"
              />
              <button
                type="submit"
                class="btn-sm bg-violet-500 hover:bg-violet-600 text-white disabled:opacity-50 disabled:cursor-not-allowed"
                :disabled="store.savingName || !nameDraft.trim()"
                data-testid="save-name-button"
              >
                {{ store.savingName ? 'Saving…' : 'Save' }}
              </button>
              <button
                type="button"
                class="btn-sm bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700/60 text-gray-600 dark:text-gray-300"
                :disabled="store.savingName"
                data-testid="cancel-name-button"
                @click="cancelEditName"
              >
                Cancel
              </button>
            </form>
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
          <div
            v-if="store.currentStoryline.anchors.length > 0"
            class="flex flex-wrap items-center gap-1.5"
            data-testid="storyline-anchors"
          >
            <span class="text-xs uppercase font-semibold mr-1">Anchors:</span>
            <RouterLink
              v-for="anchor in store.currentStoryline.anchors"
              :key="anchor.id"
              :to="`/entities/${anchor.id}`"
              class="inline-flex items-center gap-1 bg-violet-50 dark:bg-violet-500/10 border border-violet-200 dark:border-violet-700/40 rounded-full px-2.5 py-0.5 text-xs text-violet-700 dark:text-violet-300 hover:underline"
              :data-testid="`storyline-anchor-${anchor.id}`"
            >
              {{ anchor.canonical_name || `#${anchor.id}` }}
            </RouterLink>
            <button
              type="button"
              class="text-xs text-violet-600 dark:text-violet-400 hover:underline ml-1"
              data-testid="edit-anchors-button"
              @click="editingAnchors = !editingAnchors"
            >
              {{ editingAnchors ? 'Close editor' : 'Edit anchors' }}
            </button>
          </div>
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

        <!-- Rename error -->
        <div
          v-if="store.nameError"
          class="mt-3 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 border border-red-200 dark:border-red-800/40 rounded-lg px-4 py-3 text-sm"
          data-testid="name-error-banner"
        >
          {{ store.nameError }}
        </div>

        <!-- Delete error -->
        <div
          v-if="deleteError"
          class="mt-3 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 border border-red-200 dark:border-red-800/40 rounded-lg px-4 py-3 text-sm"
          data-testid="delete-error-banner"
        >
          {{ deleteError }}
        </div>

        <!-- Inline anchor editor (W30): kept inline rather than in a
             modal so the current panels stay visible while the user
             decides what a regeneration would replace. -->
        <StorylineAnchorEditor
          v-if="editingAnchors"
          :storyline-id="store.currentStoryline.id"
          :anchors="store.currentStoryline.anchors"
          class="mt-4"
          @close="editingAnchors = false"
          @saved="onAnchorsSaved"
        />
      </div>

      <!-- Chapter rail (left) + two-panel reader (right). The rail lists
           the storyline's chapters; selecting one lazy-loads its panels
           into the reader, and citation numbering restarts per chapter. -->
      <div class="flex flex-col md:flex-row gap-4">
        <!-- Left chapter rail (Layout A). -->
        <aside
          class="md:w-56 md:shrink-0 md:border-r border-gray-200 dark:border-gray-700/60 md:pr-3"
          data-testid="chapter-rail"
        >
          <h2
            class="text-xs font-semibold uppercase tracking-wider text-gray-600 dark:text-gray-300 mb-2"
          >
            Chapters
          </h2>
          <ul class="space-y-1">
            <li v-for="c in chapters" :key="c.id">
              <button
                type="button"
                data-test="chapter-rail-item"
                class="w-full text-left px-2 py-1.5 rounded-md text-sm transition-colors"
                :class="
                  c.id === selectedChapterId
                    ? 'bg-violet-500/10 text-violet-700 dark:text-violet-300'
                    : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700/40'
                "
                :aria-current="c.id === selectedChapterId ? 'true' : undefined"
                @click="selectChapter(c.id)"
              >
                <span class="font-medium">{{
                  c.title || `Chapter ${c.seq}`
                }}</span>
                <span class="block text-xs text-gray-500 dark:text-gray-400">
                  {{ c.start_date ?? '…' }} – {{ c.end_date ?? 'now' }}
                  <span
                    v-if="c.state === 'open'"
                    class="ml-1 text-emerald-600 dark:text-emerald-400"
                    >• open</span
                  >
                  <span v-else class="ml-1 text-gray-400 dark:text-gray-500"
                    >• closed</span
                  >
                </span>
              </button>
            </li>
          </ul>
        </aside>

        <!-- Reader: chapter-loading skeleton, then the two-panel layout.
             Mirrors the edit-mode layout in EntryDetailView.vue. -->
        <div
          v-if="store.chapterLoading && !store.currentChapter"
          class="flex-1 py-16 text-center text-gray-600 dark:text-gray-300"
          data-testid="chapter-loading"
        >
          Loading chapter…
        </div>
        <!-- Two-panel layout: stacks below lg (1024px), side-by-side above.
             Each panel scrolls independently; there's no synchronised
             scrolling primitive in v1. -->
        <div v-else class="flex-1 flex flex-col lg:flex-row gap-4">
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
        </div>
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
