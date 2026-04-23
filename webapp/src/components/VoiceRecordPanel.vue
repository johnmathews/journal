<script setup lang="ts">
import { ref, computed, watch, onUnmounted } from 'vue'
import { useEntriesStore } from '@/stores/entries'
import { useJobsStore } from '@/stores/jobs'
import { useWakeLock } from '@/composables/useWakeLock'
import { isTerminal } from '@/types/job'

const props = defineProps<{ entryDate: string }>()
const emit = defineEmits<{
  submitted: [jobId: string]
}>()

const entriesStore = useEntriesStore()
const jobsStore = useJobsStore()
const wakeLock = useWakeLock()

// Recording state
const isUnmounted = ref(false)
const isRecording = ref(false)
const recordings = ref<{ blob: Blob; duration: number; url: string }[]>([])
const recordingDuration = ref(0)
const mediaRecorder = ref<MediaRecorder | null>(null)
const durationTimer = ref<ReturnType<typeof setInterval> | null>(null)
const playingIndex = ref<number | null>(null)
const audioElement = ref<HTMLAudioElement | null>(null)
const micError = ref<string | null>(null)

// Job state (mirrors ImageUploadPanel)
const jobId = ref<string | null>(null)
const submitError = ref<string | null>(null)

const currentJob = computed(() =>
  jobId.value ? jobsStore.jobs[jobId.value] : null,
)
const progressPercent = computed(() => {
  const job = currentJob.value
  if (!job || !job.progress_total) return 0
  return Math.round((job.progress_current / job.progress_total) * 100)
})

const totalDuration = computed(() =>
  recordings.value.reduce((sum, r) => sum + r.duration, 0),
)

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function getSupportedMimeType(): string {
  const types = ['audio/webm', 'audio/mp4', 'audio/ogg']
  for (const type of types) {
    if (MediaRecorder.isTypeSupported(type)) return type
  }
  return 'audio/webm' // fallback
}

async function startRecording() {
  micError.value = null
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    const mimeType = getSupportedMimeType()
    const recorder = new MediaRecorder(stream, { mimeType })
    const chunks: Blob[] = []

    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunks.push(e.data)
    }

    recorder.onstop = () => {
      // Stop all tracks to release the microphone
      stream.getTracks().forEach((t) => t.stop())
      // Guard against unmount race — onstop fires asynchronously
      if (isUnmounted.value) return
      const blob = new Blob(chunks, { type: mimeType })
      const url = URL.createObjectURL(blob)
      recordings.value.push({
        blob,
        duration: recordingDuration.value,
        url,
      })
      recordingDuration.value = 0
    }

    mediaRecorder.value = recorder
    recorder.start()
    isRecording.value = true
    recordingDuration.value = 0
    await wakeLock.request()
    durationTimer.value = setInterval(() => {
      recordingDuration.value++
    }, 1000)
  } catch {
    micError.value =
      'Could not access microphone. Please check browser permissions.'
  }
}

function stopRecording() {
  if (mediaRecorder.value && mediaRecorder.value.state === 'recording') {
    mediaRecorder.value.stop()
  }
  mediaRecorder.value = null
  isRecording.value = false
  if (durationTimer.value) {
    clearInterval(durationTimer.value)
    durationTimer.value = null
  }
  wakeLock.release()
}

function removeRecording(index: number) {
  if (playingIndex.value === index) stopPlayback()
  const removed = recordings.value.splice(index, 1)[0]
  URL.revokeObjectURL(removed.url)
}

function togglePlayback(index: number) {
  if (playingIndex.value === index) {
    stopPlayback()
    return
  }
  stopPlayback()
  const audio = new Audio(recordings.value[index].url)
  audio.onended = () => {
    playingIndex.value = null
    audioElement.value = null
  }
  audio.play()
  audioElement.value = audio
  playingIndex.value = index
}

function stopPlayback() {
  if (audioElement.value) {
    audioElement.value.pause()
    audioElement.value = null
  }
  playingIndex.value = null
}

async function submit() {
  if (recordings.value.length === 0) return
  submitError.value = null
  try {
    const blobs = recordings.value.map((r) => r.blob)
    const result = await entriesStore.uploadAudio(blobs, props.entryDate)
    jobId.value = result.job_id
    emit('submitted', result.job_id)
    jobsStore.trackJob(result.job_id, 'ingest_audio', {
      entry_date: props.entryDate,
      recording_count: recordings.value.length,
    })
  } catch {
    submitError.value =
      entriesStore.createError || 'Failed to upload recordings'
  }
}

function acknowledge() {
  stopPlayback()
  jobId.value = null
  submitError.value = null
  // Revoke all blob URLs
  recordings.value.forEach((r) => URL.revokeObjectURL(r.url))
  recordings.value = []
}

watch(currentJob, (job) => {
  if (job && isTerminal(job.status)) {
    acknowledge()
  }
})

function retry() {
  submitError.value = null
}

onUnmounted(() => {
  isUnmounted.value = true
  stopRecording()
  stopPlayback()
  recordings.value.forEach((r) => URL.revokeObjectURL(r.url))
})
</script>

<template>
  <div
    class="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6"
  >
    <!-- Processing state -->
    <div v-if="jobId" class="text-center py-12">
      <h3 class="text-lg font-medium text-gray-900 dark:text-gray-100 mb-4">
        Transcribing your recording{{ recordings.length > 1 ? 's' : '' }}...
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
          Uploading recordings...
        </template>
        <template v-else-if="currentJob?.progress_total">
          Transcribing recording {{ currentJob.progress_current }} of
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

    <!-- Recording state -->
    <div v-else>
      <!-- Mic error -->
      <div
        v-if="micError"
        class="mb-4 flex items-start gap-3 rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 px-4 py-3 text-sm text-red-700 dark:text-red-300"
      >
        <p class="flex-1">{{ micError }}</p>
        <button
          class="shrink-0 text-red-400 hover:text-red-600 dark:hover:text-red-200"
          @click="micError = null"
        >
          &times;
        </button>
      </div>

      <!-- Active recording indicator -->
      <div v-if="isRecording" class="text-center py-8">
        <div class="flex items-center justify-center gap-3 mb-4">
          <span
            class="inline-block w-4 h-4 bg-red-500 rounded-full animate-pulse"
          />
          <span class="text-lg font-medium text-gray-900 dark:text-gray-100">
            Recording...
          </span>
        </div>
        <p
          class="text-3xl font-mono text-gray-700 dark:text-gray-300 mb-6"
          data-testid="recording-timer"
        >
          {{ formatDuration(recordingDuration) }}
        </p>
        <button
          class="btn bg-red-500 hover:bg-red-600 text-white px-6 py-2 rounded-lg text-sm font-medium"
          data-testid="stop-button"
          @click="stopRecording"
        >
          Stop Recording
        </button>
      </div>

      <!-- Empty state — no recordings yet, not actively recording -->
      <div
        v-else-if="recordings.length === 0"
        class="flex flex-col items-center justify-center py-12"
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
            d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4M12 1a3 3 0 00-3 3v7a3 3 0 006 0V4a3 3 0 00-3-3z"
          />
        </svg>
        <p class="text-sm text-gray-600 dark:text-gray-300 mb-1">
          Record a voice journal entry
        </p>
        <p class="text-xs text-gray-400 mb-4">
          You can record multiple segments and they will be combined
        </p>
        <button
          class="btn bg-violet-500 hover:bg-violet-600 text-white px-6 py-2 rounded-lg text-sm font-medium"
          data-testid="start-button"
          @click="startRecording"
        >
          Start Recording
        </button>
      </div>

      <!-- Recordings list -->
      <div v-else class="space-y-2">
        <div
          v-for="(rec, index) in recordings"
          :key="index"
          class="flex items-center justify-between bg-gray-50 dark:bg-gray-900/50 rounded-lg px-4 py-3 border border-gray-200 dark:border-gray-700"
        >
          <div class="flex items-center space-x-3">
            <span
              class="inline-flex items-center justify-center w-8 h-8 rounded-full bg-violet-100 dark:bg-violet-900/40 text-violet-700 dark:text-violet-300 text-sm font-bold"
            >
              {{ index + 1 }}
            </span>
            <div>
              <p class="text-sm font-medium text-gray-700 dark:text-gray-300">
                Recording {{ index + 1 }}
              </p>
              <p class="text-xs text-gray-600 dark:text-gray-300">
                {{ formatDuration(rec.duration) }} &middot;
                {{ formatSize(rec.blob.size) }}
              </p>
            </div>
          </div>
          <div class="flex items-center space-x-2">
            <button
              class="p-1.5 rounded text-gray-500 hover:text-violet-600 dark:hover:text-violet-400"
              :title="playingIndex === index ? 'Stop' : 'Play'"
              :data-testid="`play-button-${index}`"
              @click="togglePlayback(index)"
            >
              <svg
                v-if="playingIndex !== index"
                class="w-5 h-5"
                fill="currentColor"
                viewBox="0 0 24 24"
              >
                <path d="M8 5v14l11-7z" />
              </svg>
              <svg
                v-else
                class="w-5 h-5"
                fill="currentColor"
                viewBox="0 0 24 24"
              >
                <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" />
              </svg>
            </button>
            <button
              class="p-1 text-red-400 hover:text-red-600"
              title="Remove"
              :data-testid="`remove-button-${index}`"
              @click="removeRecording(index)"
            >
              &times;
            </button>
          </div>
        </div>

        <!-- Add another recording -->
        <button
          class="flex items-center justify-center w-full h-12 border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg hover:border-violet-400 transition-colors text-sm text-gray-600 dark:text-gray-300"
          data-testid="add-recording-button"
          @click="startRecording"
        >
          + Add recording
        </button>

        <!-- Footer -->
        <div
          class="flex items-center justify-between mt-4 pt-4 border-t border-gray-200 dark:border-gray-700"
        >
          <span class="text-sm text-gray-600 dark:text-gray-300">
            {{ recordings.length }}
            {{ recordings.length === 1 ? 'recording' : 'recordings' }}
            &middot; {{ formatDuration(totalDuration) }} total
          </span>
          <button
            :disabled="entriesStore.creating"
            class="btn bg-violet-500 hover:bg-violet-600 text-white disabled:opacity-50 disabled:cursor-not-allowed px-4 py-2 rounded-lg text-sm font-medium"
            data-testid="submit-button"
            @click="submit"
          >
            {{
              entriesStore.creating
                ? 'Uploading...'
                : 'Submit for Transcription'
            }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
