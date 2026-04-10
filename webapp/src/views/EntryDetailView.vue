<script setup lang="ts">
import { onMounted, onBeforeUnmount, ref, nextTick, watch } from 'vue'
import { useRouter, onBeforeRouteLeave } from 'vue-router'
import { useEntriesStore } from '@/stores/entries'
import { useEntryEditor } from '@/composables/useEntryEditor'
import { useDiffHighlight } from '@/composables/useDiffHighlight'

const props = defineProps<{
  id: string
}>()

const router = useRouter()
const store = useEntriesStore()
const { editedText, saving, saveError, isDirty, isModified, reset } =
  useEntryEditor(() => store.currentEntry)

// Original text as a reactive ref the composable can watch.
const originalText = ref('')
watch(
  () => store.currentEntry?.raw_text,
  (t) => {
    if (t !== undefined) originalText.value = t
  },
  { immediate: true },
)

// Toggle for the live diff highlighting. Defaults to on.
const showDiff = ref(true)
const { originalHtml, correctedHtml } = useDiffHighlight(
  originalText,
  editedText,
  showDiff,
)

// Mirror-div overlay scroll sync: keep the backdrop scrolled to the
// same Y as the editable textarea so highlight positions line up with
// the characters the user sees.
const correctedBackdrop = ref<HTMLDivElement | null>(null)
const correctedTextarea = ref<HTMLTextAreaElement | null>(null)

function syncCorrectedScroll() {
  if (correctedBackdrop.value && correctedTextarea.value) {
    correctedBackdrop.value.scrollTop = correctedTextarea.value.scrollTop
    correctedBackdrop.value.scrollLeft = correctedTextarea.value.scrollLeft
  }
}

// Re-sync scroll after content changes (the backdrop's height can shift
// as the user types, so wait for the DOM to settle first).
watch(correctedHtml, () => {
  nextTick(syncCorrectedScroll)
})

onMounted(() => {
  store.loadEntry(Number(props.id))
})

async function save() {
  if (!store.currentEntry || !isDirty.value) return
  saving.value = true
  saveError.value = null
  try {
    await store.saveEntryText(store.currentEntry.id, editedText.value)
  } catch (e) {
    saveError.value = e instanceof Error ? e.message : 'Failed to save'
  } finally {
    saving.value = false
  }
}

function goBack() {
  router.push({ name: 'entries' })
}

function formatDate(dateStr: string): string {
  if (!dateStr) return ''
  return new Date(dateStr).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
}

onBeforeRouteLeave((_to, _from, next) => {
  if (isDirty.value) {
    const answer = window.confirm('You have unsaved changes. Leave anyway?')
    next(answer)
  } else {
    next()
  }
})

function handleBeforeUnload(e: BeforeUnloadEvent) {
  if (isDirty.value) {
    e.preventDefault()
  }
}

onMounted(() => {
  window.addEventListener('beforeunload', handleBeforeUnload)
})

onBeforeUnmount(() => {
  window.removeEventListener('beforeunload', handleBeforeUnload)
})
</script>

<template>
  <div class="entry-detail" data-testid="entry-detail-view">
    <!-- Loading state -->
    <div
      v-if="store.loading && !store.currentEntry"
      class="py-16 text-center text-gray-500 dark:text-gray-400"
      data-testid="loading-state"
    >
      Loading entry…
    </div>

    <!-- Fatal error (no entry loaded) -->
    <div
      v-else-if="store.error && !store.currentEntry"
      class="mb-4 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 border border-red-200 dark:border-red-800/40 rounded-lg px-4 py-3 text-sm"
      data-testid="error-banner"
    >
      {{ store.error }}
    </div>

    <template v-else-if="store.currentEntry">
      <!-- Header row: back + title + meta -->
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
            >
              {{ formatDate(store.currentEntry.entry_date) }}
            </h1>
            <span
              v-if="isModified"
              class="inline-flex text-xs font-medium bg-yellow-100 text-yellow-700 dark:bg-yellow-500/20 dark:text-yellow-400 rounded-full px-2.5 py-0.5"
              data-testid="modified-tag"
            >
              Modified
            </span>
          </div>

          <div
            class="flex items-center gap-4 text-sm text-gray-500 dark:text-gray-400"
          >
            <span>{{ store.currentEntry.source_type.toUpperCase() }}</span>
            <span
              >{{ store.currentEntry.word_count.toLocaleString() }} words</span
            >
            <span>{{ store.currentEntry.chunk_count }} chunks</span>
            <span>
              {{ store.currentEntry.page_count }} page{{
                store.currentEntry.page_count !== 1 ? 's' : ''
              }}
            </span>
          </div>
        </div>
      </div>

      <!-- Save error banner -->
      <div
        v-if="saveError"
        class="mb-4 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 border border-red-200 dark:border-red-800/40 rounded-lg px-4 py-3 text-sm"
        data-testid="save-error-banner"
      >
        {{ saveError }}
      </div>

      <!-- Editor toolbar -->
      <div class="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div class="min-h-[2rem] flex items-center gap-4">
          <span
            v-if="isDirty"
            class="text-sm font-medium text-yellow-600 dark:text-yellow-400"
            data-testid="unsaved-indicator"
          >
            Unsaved changes
          </span>
          <label
            class="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-300 cursor-pointer select-none"
            data-testid="diff-toggle-label"
          >
            <input
              v-model="showDiff"
              type="checkbox"
              class="form-checkbox rounded text-violet-500 focus:ring-violet-500"
              data-testid="diff-toggle"
            />
            Show diff
          </label>
          <!-- Legend (only visible when diff is on) -->
          <div
            v-if="showDiff"
            class="hidden sm:flex items-center gap-3 text-xs text-gray-500 dark:text-gray-400"
            data-testid="diff-legend"
          >
            <span class="flex items-center gap-1">
              <span
                class="inline-block w-3 h-3 rounded bg-red-100 dark:bg-red-900/40 border border-red-200 dark:border-red-800/40"
              />
              removed
            </span>
            <span class="flex items-center gap-1">
              <span
                class="inline-block w-3 h-3 rounded bg-emerald-100 dark:bg-emerald-900/40 border border-emerald-200 dark:border-emerald-800/40"
              />
              added
            </span>
          </div>
        </div>
        <div class="flex items-center gap-2">
          <button
            class="btn bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700/60 text-gray-600 dark:text-gray-300 hover:text-gray-800 dark:hover:text-gray-100 disabled:opacity-50 disabled:cursor-not-allowed"
            :disabled="!isDirty || saving"
            data-testid="reset-button"
            @click="reset"
          >
            <svg class="w-4 h-4 fill-current mr-1" viewBox="0 0 16 16">
              <path
                d="M8 2a6 6 0 1 0 5.197 3H15a8 8 0 1 1-1-4.928V1a1 1 0 1 1 2 0v3a1 1 0 0 1-1 1h-3a1 1 0 1 1 0-2h.228A6 6 0 0 0 8 2Z"
              />
            </svg>
            Reset
          </button>
          <button
            class="btn bg-violet-500 hover:bg-violet-600 text-white disabled:opacity-50 disabled:cursor-not-allowed"
            :disabled="!isDirty || saving"
            data-testid="save-button"
            @click="save"
          >
            <svg class="w-4 h-4 fill-current mr-1" viewBox="0 0 16 16">
              <path d="M13.7 4.3 6 12l-3.7-3.7 1.4-1.4L6 9.2l6.3-6.3z" />
            </svg>
            {{ saving ? 'Saving…' : 'Save' }}
          </button>
        </div>
      </div>

      <!-- Side-by-side editor panels (static 50/50) -->
      <div class="flex flex-col lg:flex-row gap-4 min-h-[500px]">
        <section
          class="flex-1 flex flex-col bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700/60 rounded-xl shadow-xs p-4"
        >
          <h2
            class="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-3"
          >
            Original OCR
          </h2>
          <!--
            Original text: read-only, renders highlighted HTML from the diff.
            The HTML is produced by useDiffHighlight, which escapes every
            chunk of user text via escapeHtml() before wrapping it in
            <mark> spans. Safe to v-html.
          -->
          <!-- eslint-disable vue/no-v-html -->
          <div
            class="diff-surface flex-1 w-full overflow-auto bg-gray-50 dark:bg-gray-900/40 text-gray-600 dark:text-gray-400 rounded-md border border-gray-200 dark:border-gray-700/60 px-3 py-2"
            data-testid="ocr-display"
            v-html="originalHtml"
          />
          <!-- eslint-enable vue/no-v-html -->
        </section>

        <section
          class="flex-1 flex flex-col bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700/60 rounded-xl shadow-xs p-4"
        >
          <h2
            class="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-3"
          >
            Corrected Text
          </h2>
          <!--
            Mirror-div overlay: a styled backdrop renders the highlighted
            HTML underneath a transparent textarea. The textarea catches
            all keyboard/mouse input and scroll; we keep the backdrop
            scrolled in lockstep so highlights stay aligned with glyphs.
          -->
          <div
            class="corrected-wrapper relative flex-1 rounded-md border border-gray-200 dark:border-gray-700/60 bg-white dark:bg-gray-900/40 overflow-hidden"
          >
            <!-- eslint-disable vue/no-v-html -->
            <div
              ref="correctedBackdrop"
              class="diff-surface absolute inset-0 overflow-auto px-3 py-2 pointer-events-none text-gray-900 dark:text-gray-100"
              aria-hidden="true"
              v-html="correctedHtml"
            />
            <!-- eslint-enable vue/no-v-html -->
            <textarea
              ref="correctedTextarea"
              v-model="editedText"
              spellcheck="false"
              class="diff-surface absolute inset-0 w-full h-full bg-transparent text-transparent caret-gray-900 dark:caret-white resize-none focus:outline-none focus:ring-2 focus:ring-violet-500/40 rounded-md px-3 py-2"
              data-testid="corrected-textarea"
              @scroll="syncCorrectedScroll"
              @input="syncCorrectedScroll"
            />
          </div>
        </section>
      </div>
    </template>
  </div>
</template>

<style scoped>
/*
  The backdrop div and the textarea above it MUST use identical
  typography so that highlighted spans line up character-for-character
  with the glyphs the user is actually editing.
*/
.diff-surface {
  font-family: ui-serif, Georgia, Cambria, 'Times New Roman', serif;
  font-size: 0.9375rem;
  line-height: 1.625;
  letter-spacing: normal;
  tab-size: 4;
  white-space: pre-wrap;
  word-wrap: break-word;
  overflow-wrap: break-word;
}

/*
  Selection on a text-transparent textarea is normally invisible.
  Restore a subtle selection background so the user can still see what
  they've selected while editing.
*/
.diff-surface::selection {
  background: rgba(139, 92, 246, 0.25); /* violet-500 @ 25% */
  color: transparent;
}
</style>
