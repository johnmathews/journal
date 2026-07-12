<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import type { ChapterDetail } from '@/types/storyline'
import StorylineNarrative from '@/components/StorylineNarrative.vue'
import { buildCitationRegistry } from '@/composables/useCitationRegistry'

/**
 * One published chapter in the storyline reader: title, derived
 * date-range eyebrow, the cited narrative, any addenda as distinct
 * "Later:" blocks, and a footer with the published date plus a small
 * menu (Rename / Mark unread / Unpublish — the latter only on the
 * newest published chapter).
 *
 * Emits `visible` once when ≥60% of the chapter scrolls into view —
 * the parent marks it read. The IntersectionObserver is guarded for
 * test environments without one; tests call `onVisible()` directly.
 */
const props = defineProps<{
  chapter: ChapterDetail
  isNewest: boolean
}>()

const emit = defineEmits<{
  (e: 'visible', chapterId: number): void
  (e: 'rename', chapterId: number, title: string): void
  (e: 'markUnread', chapterId: number): void
  (e: 'unpublish', chapterId: number): void
}>()

const registry = computed(() =>
  buildCitationRegistry([
    props.chapter.segments,
    ...props.chapter.addenda.map((a) => a.segments),
  ]),
)

const dateRange = computed(() => {
  const { first_entry_date: first, last_entry_date: last } = props.chapter
  if (!first) return ''
  if (!last || first === last) return first
  return `${first} – ${last}`
})

function formatDate(iso: string | null): string {
  if (!iso) return ''
  const ts = Date.parse(iso)
  if (Number.isNaN(ts)) return iso
  return new Date(ts).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

// ── visibility → mark-read ─────────────────────────────────────
const rootRef = ref<HTMLElement | null>(null)
let observer: IntersectionObserver | null = null
let visibilityFired = false

function onVisible(): void {
  if (visibilityFired) return
  visibilityFired = true
  emit('visible', props.chapter.id)
  observer?.disconnect()
  observer = null
}

onMounted(() => {
  if (typeof IntersectionObserver === 'undefined') return
  if (!rootRef.value) return
  observer = new IntersectionObserver(
    (entries) => {
      if (entries.some((e) => e.intersectionRatio >= 0.6)) onVisible()
    },
    { threshold: 0.6 },
  )
  observer.observe(rootRef.value)
})

onBeforeUnmount(() => {
  observer?.disconnect()
  observer = null
})

defineExpose({ onVisible })

// ── footer menu ────────────────────────────────────────────────
const menuOpen = ref(false)
const renaming = ref(false)
const titleDraft = ref('')

function toggleMenu(): void {
  menuOpen.value = !menuOpen.value
}

function onDocumentClick(event: MouseEvent): void {
  if (!menuOpen.value) return
  if (rootRef.value && !rootRef.value.contains(event.target as Node)) {
    menuOpen.value = false
  }
}

onMounted(() => document.addEventListener('click', onDocumentClick))
onBeforeUnmount(() => document.removeEventListener('click', onDocumentClick))

function startRename(): void {
  titleDraft.value = props.chapter.title
  renaming.value = true
  menuOpen.value = false
}

function onMenuMarkUnread(): void {
  menuOpen.value = false
  emit('markUnread', props.chapter.id)
}

function onMenuUnpublish(): void {
  menuOpen.value = false
  emit('unpublish', props.chapter.id)
}

function saveRename(): void {
  const trimmed = titleDraft.value.trim()
  if (!trimmed) return
  emit('rename', props.chapter.id, trimmed)
  renaming.value = false
}
</script>

<template>
  <article
    ref="rootRef"
    class="chapter-reader bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700/60 rounded-xl shadow-xs p-4 md:p-6"
    :data-testid="`chapter-reader-${chapter.id}`"
  >
    <div
      v-if="dateRange"
      class="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-1"
      data-testid="chapter-date-eyebrow"
    >
      {{ dateRange }}
    </div>
    <div class="flex items-start justify-between gap-3 mb-3">
      <h2
        v-if="!renaming"
        class="text-xl md:text-2xl font-bold text-gray-800 dark:text-gray-100"
        data-testid="chapter-title"
      >
        {{ chapter.title || `Chapter ${chapter.seq}` }}
      </h2>
      <form
        v-else
        class="flex items-center gap-2"
        data-testid="chapter-rename-form"
        @submit.prevent="saveRename"
      >
        <input
          v-model="titleDraft"
          type="text"
          class="form-input text-lg font-bold w-64"
          aria-label="Chapter title"
          data-testid="chapter-rename-input"
          @keydown.esc="renaming = false"
        />
        <button
          type="submit"
          class="btn-sm bg-violet-500 hover:bg-violet-600 text-white disabled:opacity-50"
          :disabled="!titleDraft.trim()"
          data-testid="chapter-rename-save"
        >
          Save
        </button>
        <button
          type="button"
          class="btn-sm bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700/60 text-gray-600 dark:text-gray-300"
          data-testid="chapter-rename-cancel"
          @click="renaming = false"
        >
          Cancel
        </button>
      </form>

      <div class="relative shrink-0">
        <button
          type="button"
          class="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 px-1"
          aria-haspopup="true"
          :aria-expanded="menuOpen"
          aria-label="Chapter actions"
          data-testid="chapter-menu-button"
          @click.stop="toggleMenu"
        >
          <svg class="w-4 h-4 fill-current" viewBox="0 0 16 16">
            <circle cx="2.5" cy="8" r="1.5" />
            <circle cx="8" cy="8" r="1.5" />
            <circle cx="13.5" cy="8" r="1.5" />
          </svg>
        </button>
        <div
          v-if="menuOpen"
          class="absolute right-0 mt-1 w-40 rounded-md border border-gray-200 dark:border-gray-700/60 bg-white dark:bg-gray-800 shadow-lg z-10 py-1 text-sm"
          data-testid="chapter-menu"
        >
          <button
            type="button"
            class="block w-full text-left px-3 py-1.5 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700/40"
            data-testid="chapter-menu-rename"
            @click="startRename"
          >
            Rename
          </button>
          <button
            v-if="chapter.read_at !== null"
            type="button"
            class="block w-full text-left px-3 py-1.5 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700/40"
            data-testid="chapter-menu-unread"
            @click="onMenuMarkUnread"
          >
            Mark unread
          </button>
          <button
            v-if="isNewest"
            type="button"
            class="block w-full text-left px-3 py-1.5 text-violet-600 dark:text-violet-400 hover:bg-violet-50 dark:hover:bg-violet-900/20"
            data-testid="chapter-menu-unpublish"
            @click="onMenuUnpublish"
          >
            Unpublish
          </button>
        </div>
      </div>
    </div>

    <div v-if="chapter.segments.length > 0">
      <StorylineNarrative :segments="chapter.segments" :registry="registry" />
    </div>
    <div
      v-else
      class="py-6 text-center text-sm text-gray-500 dark:text-gray-400"
      data-testid="chapter-empty"
    >
      No narrative yet.
    </div>

    <!-- Addenda: later-discovered material, visually distinct from the
         immutable original narrative. -->
    <section
      v-for="(addendum, idx) in chapter.addenda"
      :key="`addendum-${idx}`"
      class="mt-4 border-l-4 border-violet-200 dark:border-violet-800/60 bg-violet-50/50 dark:bg-violet-900/10 rounded-r-lg px-4 py-3"
      :data-testid="`chapter-addendum-${idx}`"
    >
      <div
        class="text-xs font-semibold uppercase tracking-wider text-violet-600 dark:text-violet-400 mb-2"
      >
        Later — {{ formatDate(addendum.added_at) }}
      </div>
      <StorylineNarrative :segments="addendum.segments" :registry="registry" />
    </section>

    <footer
      class="mt-4 pt-3 border-t border-gray-200 dark:border-gray-700/60 text-xs text-gray-500 dark:text-gray-400"
      data-testid="chapter-footer"
    >
      Published {{ formatDate(chapter.published_at) }}
      <span v-if="chapter.entry_count">
        · {{ chapter.entry_count }} entr{{
          chapter.entry_count === 1 ? 'y' : 'ies'
        }}</span
      >
    </footer>
  </article>
</template>
