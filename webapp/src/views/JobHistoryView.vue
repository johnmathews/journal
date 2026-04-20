<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { listJobs, type JobListParams, type JobListResponse } from '@/api/jobs'
import type { Job, JobType, JobStatus } from '@/types/job'

const jobs = ref<Job[]>([])
const total = ref(0)
const loading = ref(false)
const error = ref<string | null>(null)

const page = ref(0)
const pageSize = 25
const filterStatus = ref<string>('')
const filterType = ref<string>('')
const expandedRows = ref<Set<string>>(new Set())

function toggleExpand(jobId: string) {
  const s = expandedRows.value
  if (s.has(jobId)) s.delete(jobId)
  else s.add(jobId)
}

function formatResultKey(key: string): string {
  return key.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

function resultSummary(result: Record<string, unknown>): string {
  const parts: string[] = []
  for (const [k, v] of Object.entries(result)) {
    if (k === 'warnings' && Array.isArray(v) && v.length === 0) continue
    if (typeof v === 'number' || typeof v === 'string') {
      parts.push(`${formatResultKey(k)}: ${v}`)
    }
  }
  return parts.join(', ') || JSON.stringify(result)
}

const totalPages = computed(() =>
  Math.max(1, Math.ceil(total.value / pageSize)),
)

async function load() {
  loading.value = true
  error.value = null
  try {
    const params: JobListParams = {
      limit: pageSize,
      offset: page.value * pageSize,
    }
    if (filterStatus.value) params.status = filterStatus.value
    if (filterType.value) params.type = filterType.value
    const resp: JobListResponse = await listJobs(params)
    jobs.value = resp.items
    total.value = resp.total
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Failed to load jobs'
  } finally {
    loading.value = false
  }
}

watch([filterStatus, filterType], () => {
  page.value = 0
  load()
})

onMounted(load)

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

function statusBadgeClass(status: JobStatus): string {
  switch (status) {
    case 'queued':
      return 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300'
    case 'running':
      return 'bg-violet-100 text-violet-700 dark:bg-violet-500/20 dark:text-violet-300'
    case 'succeeded':
      return 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300'
    case 'failed':
      return 'bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-300'
  }
}

function formatTime(iso: string | null): string {
  if (!iso) return '-'
  const d = new Date(iso)
  return d.toLocaleString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
}

function duration(job: Job): string {
  if (!job.started_at || !job.finished_at) return '-'
  const ms =
    new Date(job.finished_at).getTime() - new Date(job.started_at).getTime()
  if (ms < 1000) return `${ms}ms`
  return `${(ms / 1000).toFixed(1)}s`
}

function paramsLabel(job: Job): string {
  const p = job.params
  const parts: string[] = []
  if (p.entry_id) parts.push(`entry ${p.entry_id}`)
  if (p.stale_only) parts.push('stale only')
  if (p.mode) parts.push(String(p.mode))
  if (p.start_date || p.end_date) {
    parts.push([p.start_date, p.end_date].filter(Boolean).join(' to '))
  }
  return parts.join(', ') || '-'
}

function prevPage() {
  if (page.value > 0) {
    page.value--
    load()
  }
}

function nextPage() {
  if (page.value < totalPages.value - 1) {
    page.value++
    load()
  }
}
</script>

<template>
  <div data-testid="job-history-view">
    <header class="mb-6">
      <h1 class="text-2xl font-bold text-gray-800 dark:text-gray-100">
        Job History
      </h1>
      <p class="text-sm text-gray-500 dark:text-gray-400 mt-1">
        Background jobs: entity extraction, mood scoring, ingestion, and more.
      </p>
    </header>

    <!-- Filters -->
    <div class="flex flex-wrap gap-3 mb-4" data-testid="job-history-filters">
      <select
        v-model="filterStatus"
        class="text-sm rounded-lg border-gray-200 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200 px-3 py-1.5"
        data-testid="filter-status"
      >
        <option value="">All statuses</option>
        <option value="queued">Queued</option>
        <option value="running">Running</option>
        <option value="succeeded">Succeeded</option>
        <option value="failed">Failed</option>
      </select>

      <select
        v-model="filterType"
        class="text-sm rounded-lg border-gray-200 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200 px-3 py-1.5"
        data-testid="filter-type"
      >
        <option value="">All types</option>
        <option value="entity_extraction">Entity extraction</option>
        <option value="mood_backfill">Mood backfill</option>
        <option value="mood_score_entry">Mood scoring</option>
        <option value="ingest_images">Image ingestion</option>
      </select>

      <button
        type="button"
        class="text-sm text-violet-600 dark:text-violet-400 hover:underline"
        data-testid="refresh-button"
        @click="load"
      >
        Refresh
      </button>
    </div>

    <!-- Error -->
    <div
      v-if="error"
      class="mb-4 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 border border-red-200 dark:border-red-800/40 rounded-lg px-3 py-2 text-sm"
      data-testid="job-history-error"
    >
      {{ error }}
    </div>

    <!-- Loading -->
    <div
      v-if="loading && jobs.length === 0"
      class="py-16 text-center text-gray-500 dark:text-gray-400"
      data-testid="job-history-loading"
    >
      Loading...
    </div>

    <!-- Empty -->
    <div
      v-else-if="jobs.length === 0 && !loading"
      class="py-16 text-center text-gray-500 dark:text-gray-400"
      data-testid="job-history-empty"
    >
      No jobs found.
    </div>

    <!-- Table -->
    <div
      v-else
      class="overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-700/60"
    >
      <table class="w-full text-sm" data-testid="job-history-table">
        <thead>
          <tr
            class="bg-gray-50 dark:bg-gray-800/60 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider"
          >
            <th class="px-4 py-3">Type</th>
            <th class="px-4 py-3">Status</th>
            <th class="px-4 py-3">Params</th>
            <th class="px-4 py-3">Created</th>
            <th class="px-4 py-3">Duration</th>
            <th class="px-4 py-3">Details</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-gray-100 dark:divide-gray-700/40">
          <tr
            v-for="job in jobs"
            :key="job.id"
            class="bg-white dark:bg-gray-900/40"
            :data-testid="`job-row-${job.id}`"
          >
            <td
              class="px-4 py-3 font-medium text-gray-700 dark:text-gray-200 whitespace-nowrap"
            >
              {{ jobLabel(job.type as JobType) }}
            </td>
            <td class="px-4 py-3">
              <span
                class="inline-block px-2 py-0.5 rounded-full text-xs font-medium capitalize"
                :class="statusBadgeClass(job.status as JobStatus)"
              >
                {{ job.status }}
              </span>
            </td>
            <td
              class="px-4 py-3 text-gray-500 dark:text-gray-400 max-w-[200px] truncate"
            >
              {{ paramsLabel(job) }}
            </td>
            <td
              class="px-4 py-3 text-gray-500 dark:text-gray-400 whitespace-nowrap"
            >
              {{ formatTime(job.created_at) }}
            </td>
            <td
              class="px-4 py-3 text-gray-500 dark:text-gray-400 whitespace-nowrap"
            >
              {{ duration(job) }}
            </td>
            <td
              class="px-4 py-3 text-gray-500 dark:text-gray-400 max-w-[350px]"
            >
              <template v-if="job.status === 'failed' && job.error_message">
                <span class="text-red-500 dark:text-red-400">{{
                  job.error_message
                }}</span>
              </template>
              <template v-else-if="job.status === 'running'">
                <span v-if="job.progress_total > 0"
                  >{{ job.progress_current }}/{{ job.progress_total }}</span
                >
                <span v-else class="text-violet-500">Running...</span>
              </template>
              <template v-else-if="job.status === 'succeeded' && job.result">
                <button
                  type="button"
                  class="text-left w-full group"
                  :data-testid="`job-details-toggle-${job.id}`"
                  @click="toggleExpand(job.id)"
                >
                  <div
                    v-if="!expandedRows.has(job.id)"
                    class="truncate group-hover:text-gray-700 dark:group-hover:text-gray-200 cursor-pointer"
                  >
                    {{ resultSummary(job.result) }}
                    <span
                      class="ml-1 text-xs text-gray-400 dark:text-gray-500 group-hover:text-violet-500"
                      >+</span
                    >
                  </div>
                  <dl v-else class="space-y-0.5 text-xs cursor-pointer">
                    <div
                      v-for="(v, k) in job.result"
                      :key="String(k)"
                      class="flex gap-2"
                    >
                      <dt
                        class="font-medium text-gray-600 dark:text-gray-300 whitespace-nowrap"
                      >
                        {{ formatResultKey(String(k)) }}:
                      </dt>
                      <dd>
                        <template v-if="Array.isArray(v) && v.length === 0"
                          >none</template
                        >
                        <template v-else-if="Array.isArray(v)">{{
                          v.join(', ')
                        }}</template>
                        <template v-else>{{ v }}</template>
                      </dd>
                    </div>
                  </dl>
                </button>
              </template>
              <template v-else>-</template>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- Pagination -->
    <div
      v-if="total > pageSize"
      class="flex items-center justify-between mt-4 text-sm text-gray-500 dark:text-gray-400"
    >
      <span>{{ total }} total jobs</span>
      <div class="flex items-center gap-2">
        <button
          type="button"
          class="px-3 py-1 rounded border border-gray-200 dark:border-gray-700 disabled:opacity-40"
          :disabled="page === 0"
          data-testid="prev-page"
          @click="prevPage"
        >
          Previous
        </button>
        <span>Page {{ page + 1 }} of {{ totalPages }}</span>
        <button
          type="button"
          class="px-3 py-1 rounded border border-gray-200 dark:border-gray-700 disabled:opacity-40"
          :disabled="page >= totalPages - 1"
          data-testid="next-page"
          @click="nextPage"
        >
          Next
        </button>
      </div>
    </div>
  </div>
</template>
