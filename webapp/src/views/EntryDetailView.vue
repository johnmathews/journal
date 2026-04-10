<script setup lang="ts">
import { onMounted, onBeforeUnmount } from 'vue'
import { useRouter, onBeforeRouteLeave } from 'vue-router'
import { useEntriesStore } from '@/stores/entries'
import { useEntryEditor } from '@/composables/useEntryEditor'

const props = defineProps<{
  id: string
}>()

const router = useRouter()
const store = useEntriesStore()
const { editedText, saving, saveError, isDirty, isModified, reset } = useEntryEditor(
  () => store.currentEntry,
)

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
            <h1 class="text-2xl md:text-3xl text-gray-800 dark:text-gray-100 font-bold">
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

          <div class="flex items-center gap-4 text-sm text-gray-500 dark:text-gray-400">
            <span>{{ store.currentEntry.source_type.toUpperCase() }}</span>
            <span>{{ store.currentEntry.word_count.toLocaleString() }} words</span>
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
        <div class="min-h-[2rem] flex items-center">
          <span
            v-if="isDirty"
            class="text-sm font-medium text-yellow-600 dark:text-yellow-400"
            data-testid="unsaved-indicator"
          >
            Unsaved changes
          </span>
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
        <section class="flex-1 flex flex-col bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700/60 rounded-xl shadow-xs p-4">
          <h2 class="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-3">
            Original OCR
          </h2>
          <textarea
            :value="store.currentEntry.raw_text"
            readonly
            class="form-textarea flex-1 w-full font-serif text-[0.9375rem] leading-relaxed bg-gray-50 dark:bg-gray-900/40 text-gray-600 dark:text-gray-400 resize-none"
            data-testid="ocr-textarea"
          />
        </section>

        <section class="flex-1 flex flex-col bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700/60 rounded-xl shadow-xs p-4">
          <h2 class="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-3">
            Corrected Text
          </h2>
          <textarea
            v-model="editedText"
            class="form-textarea flex-1 w-full font-serif text-[0.9375rem] leading-relaxed resize-none"
            data-testid="corrected-textarea"
          />
        </section>
      </div>
    </template>
  </div>
</template>
