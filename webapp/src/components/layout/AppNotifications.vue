<script setup lang="ts">
import { ref, computed, onBeforeUnmount } from 'vue'
import { useJobsStore } from '@/stores/jobs'
import { isTerminal } from '@/types/job'
import type { Job, JobType } from '@/types/job'

const jobsStore = useJobsStore()
const open = ref(false)

// Recently completed jobs linger for a few seconds so the user
// can see the result before they vanish from the list.
const recentlyCompleted = ref<Map<string, ReturnType<typeof setTimeout>>>(
  new Map(),
)

function onJobComplete(jobId: string) {
  const timer = setTimeout(() => {
    recentlyCompleted.value.delete(jobId)
    jobsStore.clearJob(jobId)
  }, 8000)
  recentlyCompleted.value.set(jobId, timer)
}

// Watch all jobs for terminal transitions
const seenTerminal = new Set<string>()
const checkInterval = setInterval(() => {
  for (const job of Object.values(jobsStore.jobs)) {
    if (
      isTerminal(job.status) &&
      !seenTerminal.has(job.id) &&
      !recentlyCompleted.value.has(job.id)
    ) {
      seenTerminal.add(job.id)
      onJobComplete(job.id)
    }
  }
}, 500)

onBeforeUnmount(() => {
  clearInterval(checkInterval)
  for (const timer of recentlyCompleted.value.values()) {
    clearTimeout(timer)
  }
})

const visibleJobs = computed<Job[]>(() =>
  Object.values(jobsStore.jobs).sort(
    (a, b) =>
      new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
  ),
)

const badgeCount = computed(() => jobsStore.activeJobs.length)

function jobLabel(type: JobType): string {
  switch (type) {
    case 'entity_extraction':
      return 'Entity extraction'
    case 'mood_backfill':
      return 'Mood backfill'
    case 'ingest_images':
      return 'Image ingestion'
    case 'mood_score_entry':
      return 'Mood scoring'
    default:
      return type
  }
}

function statusIcon(job: Job): string {
  switch (job.status) {
    case 'queued':
      return '◻'
    case 'running':
      return '⟳'
    case 'succeeded':
      return '✓'
    case 'failed':
      return '✗'
  }
}

function statusClass(job: Job): string {
  switch (job.status) {
    case 'queued':
      return 'text-gray-400 dark:text-gray-500'
    case 'running':
      return 'text-violet-500 dark:text-violet-400 animate-spin-slow'
    case 'succeeded':
      return 'text-emerald-500 dark:text-emerald-400'
    case 'failed':
      return 'text-red-500 dark:text-red-400'
  }
}

function dismiss(jobId: string) {
  const timer = recentlyCompleted.value.get(jobId)
  if (timer) clearTimeout(timer)
  recentlyCompleted.value.delete(jobId)
  jobsStore.clearJob(jobId)
}

function closeDropdown() {
  open.value = false
}
</script>

<template>
  <div class="relative" data-testid="app-notifications">
    <button
      type="button"
      class="relative flex items-center justify-center w-8 h-8 rounded-lg text-gray-400 hover:text-gray-500 dark:text-gray-500 dark:hover:text-gray-400 transition-colors"
      :class="{ 'text-violet-500 dark:text-violet-400': badgeCount > 0 }"
      aria-label="Notifications"
      data-testid="notifications-bell"
      @click="open = !open"
    >
      <!-- Bell icon -->
      <svg
        class="w-5 h-5"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        stroke-width="1.5"
      >
        <path
          stroke-linecap="round"
          stroke-linejoin="round"
          d="M14.857 17.082a23.848 23.848 0 0 0 5.454-1.31A8.967 8.967 0 0 1 18 9.75V9A6 6 0 0 0 6 9v.75a8.967 8.967 0 0 1-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 0 1-5.714 0m5.714 0a3 3 0 1 1-5.714 0"
        />
      </svg>
      <!-- Badge -->
      <span
        v-if="badgeCount > 0"
        class="absolute -top-0.5 -right-0.5 flex items-center justify-center w-4 h-4 text-[0.6rem] font-bold leading-none text-white bg-violet-500 rounded-full"
        data-testid="notifications-badge"
      >
        {{ badgeCount }}
      </span>
    </button>

    <!-- Dropdown -->
    <Transition
      enter-active-class="transition ease-out duration-100"
      enter-from-class="opacity-0 scale-95"
      enter-to-class="opacity-100 scale-100"
      leave-active-class="transition ease-in duration-75"
      leave-from-class="opacity-100 scale-100"
      leave-to-class="opacity-0 scale-95"
    >
      <div
        v-if="open"
        class="absolute right-0 mt-2 w-80 origin-top-right rounded-lg bg-white dark:bg-gray-800 shadow-lg ring-1 ring-black/5 dark:ring-white/10 z-50"
        data-testid="notifications-dropdown"
      >
        <div class="px-3 py-2 border-b border-gray-100 dark:border-gray-700/60">
          <p
            class="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider"
          >
            Running jobs
          </p>
        </div>

        <div
          v-if="visibleJobs.length === 0"
          class="px-3 py-6 text-center text-sm text-gray-400 dark:text-gray-500"
        >
          No recent jobs
        </div>

        <ul
          v-else
          class="max-h-64 overflow-y-auto divide-y divide-gray-100 dark:divide-gray-700/40"
        >
          <li
            v-for="job in visibleJobs"
            :key="job.id"
            class="px-3 py-2.5 flex items-start gap-2.5"
            :data-testid="`notification-job-${job.id}`"
          >
            <span class="mt-0.5 text-sm font-mono" :class="statusClass(job)">
              {{ statusIcon(job) }}
            </span>
            <div class="flex-1 min-w-0">
              <p
                class="text-sm font-medium text-gray-700 dark:text-gray-200 truncate"
              >
                {{ jobLabel(job.type) }}
              </p>
              <p
                v-if="job.status === 'running' && job.progress_total > 0"
                class="text-xs text-gray-400 dark:text-gray-500"
              >
                {{ job.progress_current }}/{{ job.progress_total }}
              </p>
              <p
                v-else-if="job.status === 'failed' && job.error_message"
                class="text-xs text-red-500 dark:text-red-400 truncate"
              >
                {{ job.error_message }}
              </p>
              <p
                v-else
                class="text-xs text-gray-400 dark:text-gray-500 capitalize"
              >
                {{ job.status }}
              </p>
            </div>
            <button
              v-if="isTerminal(job.status)"
              type="button"
              class="text-gray-300 hover:text-gray-500 dark:text-gray-600 dark:hover:text-gray-400 text-xs"
              aria-label="Dismiss"
              @click="dismiss(job.id)"
            >
              ✕
            </button>
          </li>
        </ul>
      </div>
    </Transition>

    <!-- Click-outside overlay to close dropdown -->
    <div v-if="open" class="fixed inset-0 z-40" @click="closeDropdown"></div>
  </div>
</template>

<style scoped>
@keyframes spin-slow {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}
.animate-spin-slow {
  animation: spin-slow 1.5s linear infinite;
}
</style>
