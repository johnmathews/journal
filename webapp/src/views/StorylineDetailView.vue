<script setup lang="ts">
import { computed, onMounted, ref, nextTick } from 'vue'
import { useRouter } from 'vue-router'
import { useStorylinesStore } from '@/stores/storylines'
import { useToast } from '@/composables/useToast'
import StorylineAnchorEditor from '@/components/StorylineAnchorEditor.vue'
import ChapterToc from '@/components/storylines/ChapterToc.vue'
import ChapterReader from '@/components/storylines/ChapterReader.vue'
import DraftBlock from '@/components/storylines/DraftBlock.vue'
import { useBackNavigation } from '@/composables/useBackNavigation'

/**
 * Book-style storyline reader. Published chapters render top-to-bottom
 * as immutable episodes; the single draft renders last, subdued. A slim
 * TOC (left at lg+) jumps between chapters and carries unread dots.
 * Scrolling a published chapter into view marks it read.
 */
const props = defineProps<{
  id: string
}>()

const router = useRouter()
const store = useStorylinesStore()
const toast = useToast()

const deleting = ref(false)
const deleteError = ref<string | null>(null)
// Anchor-edit panel toggle. The editor mounts fresh on each open
// (v-if) so its picked set re-seeds from the saved anchors.
const editingAnchors = ref(false)
// Inline title editing. `nameDraft` seeds from the saved name when the
// editor opens; Save trims and PATCHes, Cancel discards.
const editingName = ref(false)
const nameDraft = ref('')

const chapters = computed(() => store.currentStoryline?.chapters ?? [])
const publishedChapters = computed(() =>
  chapters.value.filter((c) => c.state === 'published'),
)
const draftMeta = computed(
  () => chapters.value.find((c) => c.state === 'draft') ?? null,
)
const newestPublishedId = computed(() => {
  const published = publishedChapters.value
  return published.length > 0 ? published[published.length - 1].id : null
})

/** The chapter highlighted in the TOC (scroll target / last visible). */
const activeChapterId = ref<number | null>(null)

function chapterDetail(chapterId: number) {
  return store.chapterCache.get(chapterId) ?? null
}

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

/** Post-save hook from the anchor editor. The PUT /anchors endpoint
 * does not touch the draft narrative, so when the user picked
 * "Save & refresh" we chain the refresh flow (job tracked by the
 * store's `updating` flag). */
async function onAnchorsSaved(payload: { refresh: boolean }): Promise<void> {
  editingAnchors.value = false
  if (payload.refresh && store.currentStoryline) {
    toast.success('Anchors updated. Refreshing the draft…')
    try {
      await store.refresh(store.currentStoryline.id)
    } catch {
      // store.actionError carries the message
    }
  } else {
    toast.success('Anchors updated. Refresh the draft to reflect the change.')
  }
}

async function confirmDelete(): Promise<void> {
  if (!store.currentStoryline || deleting.value) return
  const name = store.currentStoryline.name
  const ok = window.confirm(
    `Delete the storyline "${name}"? Chapters are removed but the source journal entries are untouched.`,
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

async function refreshDraft(): Promise<void> {
  if (!store.currentStoryline) return
  try {
    await store.refresh(store.currentStoryline.id)
    toast.success('Draft refresh queued.')
  } catch {
    // store.actionError carries the message
  }
}

async function onUnpublish(): Promise<void> {
  if (!store.currentStoryline) return
  const ok = window.confirm(
    'Unpublish the newest chapter? Its entries fold back into the draft ' +
      'and the chapter text is re-judged as the draft evolves.',
  )
  if (!ok) return
  try {
    await store.unpublishNewest(store.currentStoryline.id)
    toast.success('Unpublish queued.')
  } catch {
    // store.actionError carries the message
  }
}

function onChapterVisible(chapterId: number): void {
  activeChapterId.value = chapterId
  const sid = Number(props.id)
  void store.markRead(sid, chapterId)
}

async function onRenameChapter(
  chapterId: number,
  title: string,
): Promise<void> {
  const sid = Number(props.id)
  try {
    await store.renameChapter(sid, chapterId, title)
    toast.success('Chapter renamed.')
  } catch (e) {
    store.actionError = e instanceof Error ? e.message : 'Failed to rename'
  }
}

async function onMarkUnread(chapterId: number): Promise<void> {
  const sid = Number(props.id)
  try {
    await store.markUnread(sid, chapterId)
  } catch {
    // store.actionError carries the message
  }
}

/** TOC selection: scroll the chapter into view. Read-marking happens
 *  via the reader's own visibility event, not here. */
function selectChapter(chapterId: number): void {
  activeChapterId.value = chapterId
  const el = document.querySelector(`[data-chapter-anchor="${chapterId}"]`)
  if (el instanceof HTMLElement) {
    el.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }
  router.replace({
    query: { ...router.currentRoute.value.query, chapter: String(chapterId) },
  })
}

onMounted(async () => {
  const sid = Number(props.id)
  // Clear stale detail so transitions between storylines re-fire watchers.
  store.clearCurrent()
  await store.loadStoryline(sid)
  // Load every chapter's content in reading order (published chapters
  // are immutable, so the per-chapter cache makes revisits free).
  for (const c of chapters.value) {
    await store.loadChapter(sid, c.id)
  }
  // Honour a valid ?chapter= query as the initial scroll target.
  const qp = Number(router.currentRoute.value.query.chapter)
  if (Number.isInteger(qp) && chapters.value.some((c) => c.id === qp)) {
    await nextTick()
    selectChapter(qp)
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
          <div class="flex flex-wrap items-center gap-3 min-w-0">
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

          <div class="flex flex-wrap items-center gap-2">
            <span
              v-if="store.updating"
              class="text-sm text-violet-600 dark:text-violet-400 animate-pulse"
              data-testid="storyline-updating"
            >
              Updating…
            </span>
            <button
              class="btn bg-white dark:bg-gray-800 border-red-200 dark:border-red-800/60 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 disabled:opacity-50 disabled:cursor-not-allowed"
              :disabled="deleting"
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
              :key="anchor.entity_id"
              :to="`/entities/${anchor.entity_id}`"
              class="inline-flex items-center gap-1 bg-violet-50 dark:bg-violet-500/10 border border-violet-200 dark:border-violet-700/40 rounded-full px-2.5 py-0.5 text-xs text-violet-700 dark:text-violet-300 hover:underline"
              :data-testid="`storyline-anchor-${anchor.entity_id}`"
            >
              {{ anchor.canonical_name || `#${anchor.entity_id}` }}
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
          <span data-testid="storyline-updated-at">
            Updated: {{ formatDateTime(store.currentStoryline.updated_at) }}
          </span>
          <span
            v-if="store.currentStoryline.unread_count > 0"
            class="inline-flex items-center rounded-full bg-violet-500/10 border border-violet-200 dark:border-violet-700/40 px-2 py-0.5 text-xs text-violet-700 dark:text-violet-300"
            data-testid="storyline-unread-count"
          >
            {{ store.currentStoryline.unread_count }} unread
          </span>
        </div>

        <!-- Action / rename / delete errors -->
        <div
          v-if="store.actionError"
          class="mt-3 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 border border-red-200 dark:border-red-800/40 rounded-lg px-4 py-3 text-sm"
          data-testid="action-error-banner"
        >
          {{ store.actionError }}
        </div>
        <div
          v-if="store.nameError"
          class="mt-3 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 border border-red-200 dark:border-red-800/40 rounded-lg px-4 py-3 text-sm"
          data-testid="name-error-banner"
        >
          {{ store.nameError }}
        </div>
        <div
          v-if="deleteError"
          class="mt-3 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 border border-red-200 dark:border-red-800/40 rounded-lg px-4 py-3 text-sm"
          data-testid="delete-error-banner"
        >
          {{ deleteError }}
        </div>

        <!-- Inline anchor editor: kept inline rather than in a modal so
             the chapters stay visible while the user decides what a
             refresh would change. -->
        <StorylineAnchorEditor
          v-if="editingAnchors"
          :storyline-id="store.currentStoryline.id"
          :anchors="store.currentStoryline.anchors"
          class="mt-4"
          @close="editingAnchors = false"
          @saved="onAnchorsSaved"
        />
      </div>

      <!-- Reader layout: slim TOC left at lg+, chapters top-to-bottom. -->
      <div class="flex flex-col lg:flex-row gap-6">
        <aside class="lg:w-56 shrink-0 order-first">
          <div class="lg:sticky lg:top-4">
            <ChapterToc
              :chapters="chapters"
              :active-id="activeChapterId"
              @select="selectChapter"
            />
          </div>
        </aside>

        <div class="flex-1 min-w-0 space-y-6" data-testid="storyline-reader">
          <template v-for="c in publishedChapters" :key="c.id">
            <div :data-chapter-anchor="c.id">
              <ChapterReader
                v-if="chapterDetail(c.id)"
                :chapter="chapterDetail(c.id)!"
                :is-newest="c.id === newestPublishedId"
                @visible="onChapterVisible"
                @rename="onRenameChapter"
                @mark-unread="onMarkUnread"
                @unpublish="onUnpublish"
              />
              <div
                v-else
                class="py-8 text-center text-sm text-gray-500 dark:text-gray-400 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700/60 rounded-xl"
                data-testid="chapter-skeleton"
              >
                Loading chapter…
              </div>
            </div>
          </template>

          <div v-if="draftMeta" :data-chapter-anchor="draftMeta.id">
            <DraftBlock
              :meta="draftMeta"
              :chapter="chapterDetail(draftMeta.id)"
              :updating="store.updating"
              @refresh="refreshDraft"
            />
          </div>

          <div
            v-if="publishedChapters.length === 0 && !draftMeta"
            class="py-16 text-center text-gray-500 dark:text-gray-400"
            data-testid="reader-empty"
          >
            No chapters yet.
          </div>
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
