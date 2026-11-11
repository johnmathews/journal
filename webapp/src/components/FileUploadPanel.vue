<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { useEntriesStore } from '@/stores/entries'
import { useJobsStore } from '@/stores/jobs'
import { isTerminal } from '@/types/job'

const props = defineProps<{ entryDate: string }>()
const emit = defineEmits<{
  created: [entryId: number]
  submitted: [jobId: string]
}>()

const entriesStore = useEntriesStore()
const jobsStore = useJobsStore()

const IMAGE_TYPES = [
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'image/heic',
  'image/heif',
]
const TEXT_EXTENSIONS = ['.md', '.txt']

type UploadMode = 'idle' | 'images' | 'text'

const mode = ref<UploadMode>('idle')
const dragOver = ref(false)

// Image mode state
const imageFiles = ref<File[]>([])
const jobId = ref<string | null>(null)
const submitError = ref<string | null>(null)

// Text mode state
const textFile = ref<File | null>(null)
const textPreview = ref('')

// Warning for unsupported files
const fileWarning = ref<string | null>(null)

function isImageFile(file: File): boolean {
  return IMAGE_TYPES.includes(file.type)
}

function isTextFile(file: File): boolean {
  const name = file.name.toLowerCase()
  return TEXT_EXTENSIONS.some((ext) => name.endsWith(ext))
}

function addFiles(newFiles: FileList | File[]) {
  const fileArray = Array.from(newFiles)
  const images = fileArray.filter(isImageFile)
  const texts = fileArray.filter(isTextFile)
  const rejected = fileArray.filter((f) => !isImageFile(f) && !isTextFile(f))

  fileWarning.value = null

  if (mode.value === 'images') {
    if (images.length > 0) {
      imageFiles.value = [...imageFiles.value, ...images]
    }
    if (rejected.length > 0 && images.length === 0) {
      fileWarning.value = unsupportedMessage(rejected)
    }
    return
  }

  if (mode.value === 'text') {
    return
  }

  // Idle — determine mode from the dropped files
  if (images.length > 0 && texts.length === 0) {
    mode.value = 'images'
    imageFiles.value = images
  } else if (texts.length > 0 && images.length === 0) {
    mode.value = 'text'
    textFile.value = texts[0]
    const reader = new FileReader()
    reader.onload = () => {
      textPreview.value = (reader.result as string).slice(0, 5000)
    }
    reader.readAsText(texts[0])
  } else if (images.length > 0 && texts.length > 0) {
    // Mixed: take images (most common use case)
    mode.value = 'images'
    imageFiles.value = images
  } else if (rejected.length > 0) {
    // All files were unsupported
    fileWarning.value = unsupportedMessage(rejected)
  }
}

function unsupportedMessage(files: File[]): string {
  const types = [...new Set(files.map((f) => f.type || 'unknown'))]
  return `Unsupported file type: ${types.join(', ')}. Accepted: JPEG, PNG, GIF, WebP, HEIC, or .md/.txt files.`
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

// Image mode functions
function removeFile(index: number) {
  imageFiles.value.splice(index, 1)
  if (imageFiles.value.length === 0) mode.value = 'idle'
}

function moveFile(from: number, to: number) {
  if (to < 0 || to >= imageFiles.value.length) return
  const item = imageFiles.value.splice(from, 1)[0]
  imageFiles.value.splice(to, 0, item)
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

const totalImageSize = computed(() =>
  imageFiles.value.reduce((sum, f) => sum + f.size, 0),
)

function objectUrl(file: File): string {
  return URL.createObjectURL(file)
}

// Text mode computed
const fileType = computed(() => {
  if (!textFile.value) return ''
  return textFile.value.name.endsWith('.md') ? 'Markdown' : 'Plain Text'
})

const textFileSize = computed(() => {
  if (!textFile.value) return ''
  const bytes = textFile.value.size
  if (bytes < 1024) return `${bytes} B`
  return `${(bytes / 1024).toFixed(1)} KB`
})

// Job progress (for image uploads)
const currentJob = computed(() =>
  jobId.value ? jobsStore.jobs[jobId.value] : null,
)
const progressPercent = computed(() => {
  const job = currentJob.value
  if (!job || !job.progress_total) return 0
  return Math.round((job.progress_current / job.progress_total) * 100)
})

// Submit handlers
async function submitImages() {
  if (imageFiles.value.length === 0) return
  submitError.value = null
  try {
    const result = await entriesStore.uploadImages(
      imageFiles.value,
      props.entryDate,
    )
    jobId.value = result.job_id
    emit('submitted', result.job_id)
    const groupId = crypto.randomUUID()
    jobsStore.createGroup(groupId, 'Entry created — all processing complete')
    jobsStore.trackJob(
      result.job_id,
      'ingest_images',
      {
        entry_date: props.entryDate,
        page_count: imageFiles.value.length,
      },
      groupId,
    )
  } catch {
    submitError.value = entriesStore.createError || 'Failed to upload images'
  }
}

async function submitText() {
  if (!textFile.value) return
  const result = await entriesStore.importFile(textFile.value, props.entryDate)
  // Track background jobs in a group for batched notifications
  const hasJobs = result.mood_job_id || result.entity_extraction_job_id
  if (hasJobs) {
    const groupId = crypto.randomUUID()
    jobsStore.createGroup(groupId, 'Entry created — all processing complete')
    if (result.mood_job_id) {
      jobsStore.trackJob(result.mood_job_id, 'mood_score_entry', {}, groupId)
    }
    if (result.entity_extraction_job_id) {
      jobsStore.trackJob(
        result.entity_extraction_job_id,
        'entity_extraction',
        {},
        groupId,
      )
    }
  }
  emit('created', result.entry.id)
}

function acknowledge() {
  jobId.value = null
  submitError.value = null
  imageFiles.value = []
  mode.value = 'idle'
}

function clearFile() {
  textFile.value = null
  textPreview.value = ''
  mode.value = 'idle'
}

function retry() {
  submitError.value = null
}

watch(currentJob, (job) => {
  if (job && isTerminal(job.status)) {
    acknowledge()
  }
})
</script>

<template>
  <div
    class="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6"
  >
    <!-- Processing state (image upload in progress) -->
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
      <p v-else class="text-sm text-gray-600 dark:text-gray-300 mb-6">
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
      <p class="text-xs text-gray-600 dark:text-gray-300 mb-3">
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

    <!-- Idle: unified drop zone -->
    <div v-else-if="mode === 'idle'">
      <label
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
            d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
          />
        </svg>
        <p class="text-sm text-gray-600 dark:text-gray-300 mb-1">
          Drag files here, or click to browse
        </p>
        <p class="text-xs text-gray-400">
          Images (JPEG, PNG, GIF, WebP, HEIC) or text files (.md, .txt)
        </p>
        <input
          type="file"
          multiple
          accept="image/jpeg,image/png,image/gif,image/webp,image/heic,image/heif,.heic,.heif,.md,.txt,text/markdown,text/plain"
          class="hidden"
          data-testid="file-input"
          @change="handleFileInput"
        />
      </label>
      <p
        v-if="fileWarning"
        class="mt-3 text-sm text-amber-600 dark:text-amber-400"
        data-testid="file-warning"
      >
        {{ fileWarning }}
      </p>
    </div>

    <!-- Image mode: file list with ordering -->
    <div v-else-if="mode === 'images'">
      <div class="space-y-2">
        <div
          v-for="(file, index) in imageFiles"
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
              <p class="text-xs text-gray-600 dark:text-gray-300">
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
              :disabled="index === imageFiles.length - 1"
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
          class="flex items-center justify-center w-full h-12 border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg cursor-pointer hover:border-violet-400 transition-colors text-sm text-gray-600 dark:text-gray-300"
          @dragover.prevent="dragOver = true"
          @dragleave="dragOver = false"
          @drop.prevent="handleDrop"
        >
          + Add more files
          <input
            type="file"
            multiple
            accept="image/jpeg,image/png,image/gif,image/webp,image/heic,image/heif,.heic,.heif,.md,.txt,text/markdown,text/plain"
            class="hidden"
            @change="handleFileInput"
          />
        </label>

        <div
          class="flex flex-col gap-3 mt-4 pt-4 border-t border-gray-200 dark:border-gray-700 sm:flex-row sm:items-center sm:justify-between sm:gap-4"
        >
          <span class="text-sm text-gray-600 dark:text-gray-300">
            {{ imageFiles.length }}
            {{ imageFiles.length === 1 ? 'page' : 'pages' }} &middot;
            {{ formatSize(totalImageSize) }}
          </span>
          <button
            :disabled="entriesStore.creating"
            class="btn bg-violet-500 hover:bg-violet-600 text-white disabled:opacity-50 disabled:cursor-not-allowed px-4 py-2 rounded-lg text-sm font-medium w-full sm:w-auto"
            @click="submitImages"
          >
            {{ entriesStore.creating ? 'Uploading...' : 'Upload & Process' }}
          </button>
        </div>
      </div>
    </div>

    <!-- Text mode: file preview -->
    <div v-else-if="mode === 'text'">
      <div
        class="flex flex-col gap-3 mb-4 sm:flex-row sm:items-center sm:justify-between sm:gap-4"
      >
        <div class="flex flex-wrap items-center gap-x-3 gap-y-1">
          <span
            class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-violet-100 dark:bg-violet-900/40 text-violet-800 dark:text-violet-300"
          >
            {{ fileType }}
          </span>
          <span
            v-if="textFile"
            class="text-sm text-gray-700 dark:text-gray-300 font-medium break-all"
            >{{ textFile.name }}</span
          >
          <span class="text-sm text-gray-600 dark:text-gray-300">{{
            textFileSize
          }}</span>
        </div>
        <button
          class="text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 self-start sm:self-auto"
          @click="clearFile"
        >
          Change file
        </button>
      </div>

      <pre
        class="bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg p-4 text-sm font-mono text-gray-700 dark:text-gray-300 max-h-[300px] overflow-auto whitespace-pre-wrap"
        >{{ textPreview }}</pre
      >

      <div class="flex justify-end mt-4">
        <button
          :disabled="entriesStore.creating"
          class="btn bg-violet-500 hover:bg-violet-600 text-white disabled:opacity-50 disabled:cursor-not-allowed px-4 py-2 rounded-lg text-sm font-medium w-full sm:w-auto"
          @click="submitText"
        >
          {{ entriesStore.creating ? 'Importing...' : 'Import File' }}
        </button>
      </div>
    </div>
  </div>
</template>
