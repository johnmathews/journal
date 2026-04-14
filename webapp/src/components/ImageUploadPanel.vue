<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { useEntriesStore } from '@/stores/entries'
import { useJobsStore } from '@/stores/jobs'
import { isTerminal } from '@/types/job'

const props = defineProps<{ entryDate: string }>()
const emit = defineEmits<{
  submitted: [jobId: string]
}>()

const entriesStore = useEntriesStore()
const jobsStore = useJobsStore()

const files = ref<File[]>([])
const dragOver = ref(false)
const jobId = ref<string | null>(null)
const submitError = ref<string | null>(null)

function addFiles(newFiles: FileList | File[]) {
  const imageFiles = Array.from(newFiles).filter((f) =>
    ['image/jpeg', 'image/png', 'image/gif', 'image/webp'].includes(f.type),
  )
  files.value = [...files.value, ...imageFiles]
}

function handleFileInput(event: Event) {
  const input = event.target as HTMLInputElement
  if (input.files) addFiles(input.files)
  input.value = ''
}

function handleDrop(event: DragEvent) {
  dragOver.value = false
  if (event.dataTransfer?.files) addFiles(event.dataTransfer.files)
}

function removeFile(index: number) {
  files.value.splice(index, 1)
}

function moveFile(from: number, to: number) {
  if (to < 0 || to >= files.value.length) return
  const item = files.value.splice(from, 1)[0]
  files.value.splice(to, 0, item)
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

const totalSize = computed(() =>
  files.value.reduce((sum, f) => sum + f.size, 0),
)

// Job progress (visible while the user hasn't dismissed the confirmation)
const currentJob = computed(() =>
  jobId.value ? jobsStore.jobs[jobId.value] : null,
)
const progressPercent = computed(() => {
  const job = currentJob.value
  if (!job || !job.progress_total) return 0
  return Math.round((job.progress_current / job.progress_total) * 100)
})

async function submit() {
  if (files.value.length === 0) return
  submitError.value = null
  try {
    const result = await entriesStore.uploadImages(files.value, props.entryDate)
    jobId.value = result.job_id
    emit('submitted', result.job_id)
    // Register with the jobs store — it handles polling and notifications
    jobsStore.trackJob(result.job_id, 'ingest_images', {
      entry_date: props.entryDate,
      page_count: files.value.length,
    })
  } catch {
    submitError.value = entriesStore.createError || 'Failed to upload images'
  }
}

/** Dismiss the processing screen and reset the form for a new entry. */
function acknowledge() {
  jobId.value = null
  submitError.value = null
  files.value = []
}

// Auto-dismiss when the job reaches a terminal state (user stayed on screen)
watch(currentJob, (job) => {
  if (job && isTerminal(job.status)) {
    acknowledge()
  }
})

function retry() {
  submitError.value = null
}

function objectUrl(file: File): string {
  return URL.createObjectURL(file)
}
</script>

<template>
  <div
    class="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6"
  >
    <!-- Processing state — non-blocking: user can dismiss and start a new entry -->
    <div v-if="jobId" class="text-center py-12">
      <h3 class="text-lg font-medium text-gray-900 dark:text-gray-100 mb-4">
        Processing your journal entry...
      </h3>
      <div
        class="w-full max-w-md mx-auto bg-gray-200 dark:bg-gray-700 rounded-full h-3 mb-3"
      >
        <div
          class="bg-violet-500 h-3 rounded-full transition-all duration-500"
          :style="{ width: `${progressPercent}%` }"
        />
      </div>
      <p
        v-if="currentJob?.status_detail"
        class="text-sm text-amber-600 dark:text-amber-400 mb-6"
      >
        {{ currentJob.status_detail }}
      </p>
      <p v-else class="text-sm text-gray-500 dark:text-gray-400 mb-6">
        <template
          v-if="currentJob?.progress_total && currentJob.progress_current === 0"
        >
          Uploading images...
        </template>
        <template v-else-if="currentJob?.progress_total">
          Running OCR on page {{ currentJob.progress_current }} of
          {{ currentJob.progress_total }}...
        </template>
        <template v-else>Queued...</template>
      </p>
      <p class="text-xs text-gray-400 dark:text-gray-500 mb-3">
        This job will continue in the background. Track progress via the
        notifications bell.
      </p>
      <button
        class="btn bg-violet-500 hover:bg-violet-600 text-white px-6 py-2 rounded-lg text-sm font-medium"
        data-testid="acknowledge-button"
        @click="acknowledge"
      >
        OK
      </button>
    </div>

    <!-- Submit error state -->
    <div v-else-if="submitError" class="text-center py-12">
      <p class="text-red-600 dark:text-red-400 mb-4">{{ submitError }}</p>
      <button
        class="btn bg-violet-500 hover:bg-violet-600 text-white px-4 py-2 rounded-lg text-sm font-medium"
        @click="retry"
      >
        Try Again
      </button>
    </div>

    <!-- Upload state -->
    <div v-else>
      <!-- Drop zone -->
      <label
        v-if="files.length === 0"
        :class="[
          'flex flex-col items-center justify-center w-full h-48 border-2 border-dashed rounded-lg cursor-pointer transition-colors',
          dragOver
            ? 'border-violet-400 bg-violet-50 dark:bg-violet-900/20'
            : 'border-gray-300 dark:border-gray-600 hover:border-violet-400 dark:hover:border-violet-500',
        ]"
        @dragover.prevent="dragOver = true"
        @dragleave="dragOver = false"
        @drop.prevent="handleDrop"
      >
        <svg
          class="w-10 h-10 text-gray-400 mb-3"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="2"
            d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
          />
        </svg>
        <p class="text-sm text-gray-500 dark:text-gray-400 mb-1">
          Drag journal page images here, or click to browse
        </p>
        <p class="text-xs text-gray-400">
          JPEG, PNG, GIF, WebP — up to 10 MB each
        </p>
        <input
          type="file"
          multiple
          accept="image/jpeg,image/png,image/gif,image/webp"
          class="hidden"
          @change="handleFileInput"
        />
      </label>

      <!-- File list -->
      <div v-if="files.length > 0" class="space-y-2">
        <div
          v-for="(file, index) in files"
          :key="`${file.name}-${index}`"
          class="flex items-center justify-between bg-gray-50 dark:bg-gray-900/50 rounded-lg px-4 py-3 border border-gray-200 dark:border-gray-700"
        >
          <div class="flex items-center space-x-3">
            <span
              class="inline-flex items-center justify-center w-8 h-8 rounded-full bg-violet-100 dark:bg-violet-900/40 text-violet-700 dark:text-violet-300 text-sm font-bold"
            >
              {{ index + 1 }}
            </span>
            <img
              :src="objectUrl(file)"
              class="w-12 h-12 object-cover rounded"
              :alt="file.name"
            />
            <div>
              <p class="text-sm font-medium text-gray-700 dark:text-gray-300">
                {{ file.name }}
              </p>
              <p class="text-xs text-gray-500 dark:text-gray-400">
                {{ formatSize(file.size) }}
              </p>
            </div>
          </div>
          <div class="flex items-center space-x-1">
            <button
              :disabled="index === 0"
              class="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 disabled:opacity-30"
              title="Move up"
              @click="moveFile(index, index - 1)"
            >
              &#9650;
            </button>
            <button
              :disabled="index === files.length - 1"
              class="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 disabled:opacity-30"
              title="Move down"
              @click="moveFile(index, index + 1)"
            >
              &#9660;
            </button>
            <button
              class="p-1 text-red-400 hover:text-red-600"
              title="Remove"
              @click="removeFile(index)"
            >
              &times;
            </button>
          </div>
        </div>

        <label
          class="flex items-center justify-center w-full h-12 border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg cursor-pointer hover:border-violet-400 transition-colors text-sm text-gray-500 dark:text-gray-400"
          @dragover.prevent="dragOver = true"
          @dragleave="dragOver = false"
          @drop.prevent="handleDrop"
        >
          + Add image
          <input
            type="file"
            multiple
            accept="image/jpeg,image/png,image/gif,image/webp"
            class="hidden"
            @change="handleFileInput"
          />
        </label>

        <div
          class="flex items-center justify-between mt-4 pt-4 border-t border-gray-200 dark:border-gray-700"
        >
          <span class="text-sm text-gray-500 dark:text-gray-400">
            {{ files.length }}
            {{ files.length === 1 ? 'page' : 'pages' }} &middot;
            {{ formatSize(totalSize) }}
          </span>
          <button
            :disabled="entriesStore.creating"
            class="btn bg-violet-500 hover:bg-violet-600 text-white disabled:opacity-50 disabled:cursor-not-allowed px-4 py-2 rounded-lg text-sm font-medium"
            @click="submit"
          >
            {{ entriesStore.creating ? 'Uploading...' : 'Upload & Process' }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
