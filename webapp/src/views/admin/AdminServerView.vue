<script setup lang="ts">
import { ref } from 'vue'
import { RouterLink } from 'vue-router'
import { ApiRequestError } from '@/api/client'
import {
  reloadMoodDimensions,
  reloadOcrContext,
  reloadTranscriptionContext,
  type MoodDimensionsReloadSummary,
  type OcrContextReloadSummary,
  type TranscriptionContextReloadSummary,
} from '@/api/admin'

type Summary =
  | OcrContextReloadSummary
  | TranscriptionContextReloadSummary
  | MoodDimensionsReloadSummary

interface ReloadState<T extends Summary> {
  loading: boolean
  summary: T | null
  error: string | null
}

const ocr = ref<ReloadState<OcrContextReloadSummary>>({
  loading: false,
  summary: null,
  error: null,
})
const transcription = ref<ReloadState<TranscriptionContextReloadSummary>>({
  loading: false,
  summary: null,
  error: null,
})
const mood = ref<ReloadState<MoodDimensionsReloadSummary>>({
  loading: false,
  summary: null,
  error: null,
})

async function trigger<T extends Summary>(
  state: ReloadState<T>,
  fn: () => Promise<T>,
  fallbackError: string,
): Promise<void> {
  state.loading = true
  state.error = null
  try {
    state.summary = await fn()
  } catch (e) {
    state.error = e instanceof ApiRequestError ? e.message : fallbackError
  } finally {
    state.loading = false
  }
}

function onReloadOcr(): Promise<void> {
  return trigger(ocr.value, reloadOcrContext, 'Failed to reload OCR context')
}

function onReloadTranscription(): Promise<void> {
  return trigger(
    transcription.value,
    reloadTranscriptionContext,
    'Failed to reload transcription context',
  )
}

function onReloadMood(): Promise<void> {
  return trigger(
    mood.value,
    reloadMoodDimensions,
    'Failed to reload mood dimensions',
  )
}

function formatTimestamp(iso: string): string {
  return new Date(iso).toLocaleString('en-GB', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
}
</script>

<template>
  <div class="space-y-6">
    <p class="text-sm text-gray-600 dark:text-gray-300 max-w-3xl">
      Three resources are read from disk only at startup: the OCR glossary
      (<code class="text-xs bg-gray-100 dark:bg-gray-700 px-1 rounded"
        >OCR_CONTEXT_DIR/*.md</code
      >), the transcription context (same files), and the mood-dimensions TOML
      (<code class="text-xs bg-gray-100 dark:bg-gray-700 px-1 rounded"
        >MOOD_DIMENSIONS_PATH</code
      >). After editing one of those files on the server, hit the matching
      button to make new requests pick up the change. In-flight requests finish
      against the old version.
    </p>

    <!-- OCR Context -->
    <section
      class="rounded-2xl bg-white dark:bg-gray-800 shadow-sm p-6"
      data-testid="reload-ocr-context"
    >
      <div class="flex items-start justify-between gap-4">
        <div>
          <h2
            class="text-lg font-semibold text-gray-800 dark:text-gray-100 mb-1"
          >
            OCR context
          </h2>
          <p class="text-sm text-gray-600 dark:text-gray-300">
            Rebuild the OCR provider from <code>OCR_CONTEXT_DIR</code>.
          </p>
        </div>
        <button
          type="button"
          class="inline-flex items-center gap-2 rounded-md bg-violet-500 hover:bg-violet-600 disabled:opacity-50 disabled:cursor-not-allowed px-4 py-2 text-sm font-medium text-white transition"
          :disabled="ocr.loading"
          @click="onReloadOcr"
        >
          {{ ocr.loading ? 'Reloading…' : 'Reload' }}
        </button>
      </div>
      <div
        v-if="ocr.error"
        class="mt-4 rounded-md bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700/60 px-3 py-2 text-sm text-red-700 dark:text-red-400"
        role="alert"
      >
        {{ ocr.error }}
      </div>
      <dl
        v-if="ocr.summary"
        class="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm"
      >
        <div>
          <dt class="text-xs uppercase text-gray-500 dark:text-gray-400">
            Provider
          </dt>
          <dd class="text-gray-800 dark:text-gray-100">
            {{ ocr.summary.provider
            }}{{ ocr.summary.dual_pass ? ' (dual-pass)' : '' }}
          </dd>
        </div>
        <div>
          <dt class="text-xs uppercase text-gray-500 dark:text-gray-400">
            Model
          </dt>
          <dd class="text-gray-800 dark:text-gray-100">
            {{ ocr.summary.model }}
          </dd>
        </div>
        <div>
          <dt class="text-xs uppercase text-gray-500 dark:text-gray-400">
            Files / chars
          </dt>
          <dd class="text-gray-800 dark:text-gray-100 tabular-nums">
            {{ ocr.summary.context_files }} /
            {{ ocr.summary.context_chars.toLocaleString() }}
          </dd>
        </div>
        <div>
          <dt class="text-xs uppercase text-gray-500 dark:text-gray-400">
            Reloaded at
          </dt>
          <dd class="text-gray-800 dark:text-gray-100">
            {{ formatTimestamp(ocr.summary.reloaded_at) }}
          </dd>
        </div>
      </dl>
    </section>

    <!-- Transcription Context -->
    <section
      class="rounded-2xl bg-white dark:bg-gray-800 shadow-sm p-6"
      data-testid="reload-transcription-context"
    >
      <div class="flex items-start justify-between gap-4">
        <div>
          <h2
            class="text-lg font-semibold text-gray-800 dark:text-gray-100 mb-1"
          >
            Transcription context
          </h2>
          <p class="text-sm text-gray-600 dark:text-gray-300">
            Rebuild the transcription provider stack from
            <code>OCR_CONTEXT_DIR</code>. Separate from OCR — see docs.
          </p>
        </div>
        <button
          type="button"
          class="inline-flex items-center gap-2 rounded-md bg-violet-500 hover:bg-violet-600 disabled:opacity-50 disabled:cursor-not-allowed px-4 py-2 text-sm font-medium text-white transition"
          :disabled="transcription.loading"
          @click="onReloadTranscription"
        >
          {{ transcription.loading ? 'Reloading…' : 'Reload' }}
        </button>
      </div>
      <div
        v-if="transcription.error"
        class="mt-4 rounded-md bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700/60 px-3 py-2 text-sm text-red-700 dark:text-red-400"
        role="alert"
      >
        {{ transcription.error }}
      </div>
      <dl
        v-if="transcription.summary"
        class="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm"
      >
        <div class="sm:col-span-2">
          <dt class="text-xs uppercase text-gray-500 dark:text-gray-400">
            Stack
          </dt>
          <dd class="text-gray-800 dark:text-gray-100 break-all">
            {{ transcription.summary.stack }}
          </dd>
        </div>
        <div>
          <dt class="text-xs uppercase text-gray-500 dark:text-gray-400">
            Files / chars
          </dt>
          <dd class="text-gray-800 dark:text-gray-100 tabular-nums">
            {{ transcription.summary.context_files }} /
            {{ transcription.summary.context_chars.toLocaleString() }}
          </dd>
        </div>
        <div>
          <dt class="text-xs uppercase text-gray-500 dark:text-gray-400">
            Reloaded at
          </dt>
          <dd class="text-gray-800 dark:text-gray-100">
            {{ formatTimestamp(transcription.summary.reloaded_at) }}
          </dd>
        </div>
      </dl>
    </section>

    <!-- Mood Dimensions -->
    <section
      class="rounded-2xl bg-white dark:bg-gray-800 shadow-sm p-6"
      data-testid="reload-mood-dimensions"
    >
      <div class="flex items-start justify-between gap-4">
        <div>
          <h2
            class="text-lg font-semibold text-gray-800 dark:text-gray-100 mb-1"
          >
            Mood dimensions
          </h2>
          <p class="text-sm text-gray-600 dark:text-gray-300">
            Re-read <code>MOOD_DIMENSIONS_PATH</code> and rebuild the mood
            scoring service. Also refreshes the
            <RouterLink
              to="/admin/moods"
              class="text-violet-600 dark:text-violet-400 hover:underline"
              >Moods</RouterLink
            >
            tab — reload that page (or sign out and back in) afterwards so the
            webapp re-fetches the cached dimension list. 409 if mood scoring is
            disabled.
          </p>
        </div>
        <button
          type="button"
          class="inline-flex items-center gap-2 rounded-md bg-violet-500 hover:bg-violet-600 disabled:opacity-50 disabled:cursor-not-allowed px-4 py-2 text-sm font-medium text-white transition"
          :disabled="mood.loading"
          @click="onReloadMood"
        >
          {{ mood.loading ? 'Reloading…' : 'Reload' }}
        </button>
      </div>
      <div
        v-if="mood.error"
        class="mt-4 rounded-md bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700/60 px-3 py-2 text-sm text-red-700 dark:text-red-400"
        role="alert"
      >
        {{ mood.error }}
      </div>
      <dl
        v-if="mood.summary"
        class="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm"
      >
        <div>
          <dt class="text-xs uppercase text-gray-500 dark:text-gray-400">
            Dimensions
          </dt>
          <dd class="text-gray-800 dark:text-gray-100 tabular-nums">
            {{ mood.summary.dimension_count }}
          </dd>
        </div>
        <div class="sm:col-span-2">
          <dt class="text-xs uppercase text-gray-500 dark:text-gray-400">
            Names
          </dt>
          <dd class="text-gray-800 dark:text-gray-100">
            {{ mood.summary.dimensions.join(', ') }}
          </dd>
        </div>
        <div class="sm:col-span-3">
          <dt class="text-xs uppercase text-gray-500 dark:text-gray-400">
            Reloaded at
          </dt>
          <dd class="text-gray-800 dark:text-gray-100">
            {{ formatTimestamp(mood.summary.reloaded_at) }}
          </dd>
        </div>
      </dl>
    </section>
  </div>
</template>
