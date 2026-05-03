<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { RouterLink } from 'vue-router'
import {
  listJobs,
  getJob,
  type JobListParams,
  type JobListResponse,
} from '@/api/jobs'
import type { Job, JobType, JobStatus } from '@/types/job'
import JobParamsCell from '@/components/JobParamsCell.vue'
import JsonPopover from '@/components/JsonPopover.vue'

const jobs = ref<Job[]>([])
const total = ref(0)
const loading = ref(false)
const error = ref<string | null>(null)

const page = ref(0)
const pageSize = 25
const filterStatus = ref<string>('')
const filterType = ref<string>('')
const expandedRows = ref<Set<string>>(new Set())

/** Cached follow-up job statuses keyed by parent job ID */
const followUpStatuses = ref<
  Record<string, Record<string, { status: JobStatus; type: string }>>
>({})

function toggleExpand(jobId: string) {
  const s = expandedRows.value
  if (s.has(jobId)) {
    s.delete(jobId)
  } else {
    s.add(jobId)
    // Fetch follow-up job statuses on first expand
    const job = jobs.value.find((j) => j.id === jobId)
    if (job?.result?.follow_up_jobs && !followUpStatuses.value[jobId]) {
      fetchFollowUpStatuses(
        jobId,
        job.result.follow_up_jobs as Record<string, string>,
      )
    }
  }
}

async function fetchFollowUpStatuses(
  parentJobId: string,
  followUpJobs: Record<string, string>,
) {
  const statuses: Record<string, { status: JobStatus; type: string }> = {}
  for (const [label, jobId] of Object.entries(followUpJobs)) {
    try {
      const fj = await getJob(jobId)
      statuses[label] = { status: fj.status as JobStatus, type: fj.type }
    } catch {
      statuses[label] = { status: 'failed' as JobStatus, type: label }
    }
  }
  followUpStatuses.value[parentJobId] = statuses
}

function formatResultKey(key: string): string {
  return key.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

/** Keys to hide from the expanded details view (shown elsewhere or internal) */
const HIDDEN_RESULT_KEYS = new Set([
  'entry_id',
  'follow_up_jobs',
  'entry_date',
  'source_type',
])

function resultSummary(
  result: Record<string, unknown>,
  jobType: JobType,
): string {
  const parts: string[] = []
  // For ingestion jobs, show meaningful summary fields
  if (jobType === 'ingest_images' || jobType === 'ingest_audio') {
    if (result.word_count != null) parts.push(`${result.word_count} words`)
    if (result.chunk_count != null) parts.push(`${result.chunk_count} chunks`)
    if (jobType === 'ingest_images' && result.page_count != null) {
      parts.push(
        `${result.page_count} ${Number(result.page_count) === 1 ? 'page' : 'pages'}`,
      )
    }
    if (jobType === 'ingest_audio' && result.recording_count != null) {
      parts.push(
        `${result.recording_count} ${Number(result.recording_count) === 1 ? 'recording' : 'recordings'}`,
      )
    }
    if (parts.length > 0) return parts.join(', ')
    // Fallback for old-format results (pre-enrichment: {"entry_id": N})
    if (result.entry_id != null) return `Entry #${result.entry_id}`
  }
  // Default: show all scalar values
  for (const [k, v] of Object.entries(result)) {
    if (HIDDEN_RESULT_KEYS.has(k)) continue
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
    case 'ingest_audio':
      return 'Audio ingestion'
    case 'mood_score_entry':
      return 'Mood scoring'
    case 'reprocess_embeddings':
      return 'Reprocess embeddings'
    case 'save_entry_pipeline':
      return 'Entry pipeline'
    default:
      return type
  }
}

function typeBadgeClass(type: JobType): string {
  switch (type) {
    case 'entity_extraction':
      return 'bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-300'
    case 'mood_backfill':
    case 'mood_score_entry':
      return 'bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300'
    case 'ingest_images':
      return 'bg-teal-100 text-teal-700 dark:bg-teal-500/20 dark:text-teal-300'
    case 'ingest_audio':
      return 'bg-cyan-100 text-cyan-700 dark:bg-cyan-500/20 dark:text-cyan-300'
    case 'reprocess_embeddings':
      return 'bg-purple-100 text-purple-700 dark:bg-purple-500/20 dark:text-purple-300'
    case 'save_entry_pipeline':
      return 'bg-indigo-100 text-indigo-700 dark:bg-indigo-500/20 dark:text-indigo-300'
    default:
      return 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300'
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
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
}

function relativeTime(iso: string | null): string {
  if (!iso) return ''
  const now = Date.now()
  const then = new Date(iso).getTime()
  const diffMs = now - then
  if (diffMs < 0) return 'just now'

  const seconds = Math.floor(diffMs / 1000)
  if (seconds < 60) return 'just now'

  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`

  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`

  const days = Math.floor(hours / 24)
  if (days < 7) return `${days}d ago`

  const weeks = Math.floor(days / 7)
  if (weeks < 5) return `${weeks}w ago`

  const months = Math.floor(days / 30)
  return `${months}mo ago`
}

function duration(job: Job): string {
  if (!job.started_at || !job.finished_at) return '-'
  const ms =
    new Date(job.finished_at).getTime() - new Date(job.started_at).getTime()
  if (ms < 1000) return `${ms}ms`
  return `${(ms / 1000).toFixed(1)}s`
}

/** Extract entry_id from params or result, preferring result for richer data */
function entryId(job: Job): number | null {
  const fromResult = job.result?.entry_id
  if (typeof fromResult === 'number') return fromResult
  const fromParams = job.params?.entry_id
  if (typeof fromParams === 'number') return fromParams
  return null
}

/** Get visible result entries, filtering out keys shown elsewhere */
/** Falls back to unfiltered entries when filtering would leave nothing
 *  (e.g. old-format ingestion results with only entry_id). */
function visibleResultEntries(
  result: Record<string, unknown>,
): [string, unknown][] {
  const filtered = Object.entries(result).filter(
    ([k]) => !HIDDEN_RESULT_KEYS.has(k),
  )
  return filtered.length > 0 ? filtered : Object.entries(result)
}

/** Keys covered by the bespoke ingestion summary line. Any other
 *  scalar in the result only appears in the expanded view. */
const INGESTION_SUMMARY_KEYS = new Set([
  'word_count',
  'chunk_count',
  'page_count',
  'recording_count',
])

/** Whether expanding the row reveals anything the collapsed summary
 *  doesn't already show. Drives both click affordance and the "+" icon. */
function isExpandable(job: Job): boolean {
  if (job.status !== 'succeeded' || !job.result) return false
  const result = job.result
  const followUps = result.follow_up_jobs
  if (
    followUps &&
    typeof followUps === 'object' &&
    Object.keys(followUps as Record<string, unknown>).length > 0
  ) {
    return true
  }
  for (const v of Object.values(result)) {
    if (Array.isArray(v) && v.length > 0) return true
  }
  const visibleScalars = visibleResultEntries(result).filter(
    ([, v]) => typeof v === 'number' || typeof v === 'string',
  )
  if (job.type === 'ingest_images' || job.type === 'ingest_audio') {
    return visibleScalars.some(([k]) => !INGESTION_SUMMARY_KEYS.has(k))
  }
  return visibleScalars.length >= 2
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
      <p class="text-sm text-gray-600 dark:text-gray-300 mt-1">
        Background jobs: entity extraction, mood scoring, ingestion, and more.
      </p>
    </header>

    <!-- Filters -->
    <div class="flex flex-wrap gap-3 mb-4" data-testid="job-history-filters">
      <select
        v-model="filterStatus"
        class="text-sm min-w-32 rounded-lg border-gray-200 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200 px-3 py-1.5"
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
        class="text-sm min-w-44 rounded-lg border-gray-200 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200 px-3 py-1.5"
        data-testid="filter-type"
      >
        <option value="">All types</option>
        <option value="entity_extraction">Entity extraction</option>
        <option value="ingest_audio">Audio ingestion</option>
        <option value="ingest_images">Image ingestion</option>
        <option value="mood_backfill">Mood backfill</option>
        <option value="mood_score_entry">Mood scoring</option>
        <option value="reprocess_embeddings">Reprocess embeddings</option>
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
      class="py-16 text-center text-gray-600 dark:text-gray-300"
      data-testid="job-history-loading"
    >
      Loading...
    </div>

    <!-- Empty -->
    <div
      v-else-if="jobs.length === 0 && !loading"
      class="py-16 text-center text-gray-600 dark:text-gray-300"
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
            class="bg-gray-50 dark:bg-gray-800/60 text-left text-xs font-medium text-gray-600 dark:text-gray-300 uppercase tracking-wider"
          >
            <th class="px-4 py-3">Type</th>
            <th class="px-4 py-3">Status</th>
            <th class="px-4 py-3">Entry</th>
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
            <!-- Type column with color badge -->
            <td class="px-4 py-3 whitespace-nowrap">
              <span
                class="inline-block px-2 py-0.5 rounded-full text-xs font-medium"
                :class="typeBadgeClass(job.type as JobType)"
                data-testid="type-badge"
              >
                {{ jobLabel(job.type as JobType) }}
              </span>
            </td>

            <!-- Status badge -->
            <td class="px-4 py-3">
              <span
                class="inline-block px-2 py-0.5 rounded-full text-xs font-medium capitalize"
                :class="statusBadgeClass(job.status as JobStatus)"
              >
                {{ job.status }}
              </span>
            </td>

            <!-- Entry column (clickable link) -->
            <td
              class="px-4 py-3 text-gray-600 dark:text-gray-300 whitespace-nowrap"
            >
              <RouterLink
                v-if="entryId(job) != null"
                :to="{
                  name: 'entry-detail',
                  params: { id: String(entryId(job)) },
                }"
                class="text-violet-600 dark:text-violet-400 hover:underline"
                data-testid="entry-link"
              >
                #{{ entryId(job) }}
              </RouterLink>
              <span v-else>-</span>
            </td>

            <!-- Params column (no longer shows entry_id — that's in Entry column) -->
            <td class="px-4 py-3 text-gray-600 dark:text-gray-300 align-middle">
              <JobParamsCell :job="job" />
            </td>

            <!-- Created column with relative time -->
            <td
              class="px-4 py-3 text-gray-600 dark:text-gray-300 whitespace-nowrap"
            >
              <span>{{ formatTime(job.created_at) }}</span>
              <span
                v-if="relativeTime(job.created_at)"
                class="ml-1.5 text-xs text-gray-400 dark:text-gray-500"
                data-testid="relative-time"
              >
                {{ relativeTime(job.created_at) }}
              </span>
            </td>

            <!-- Duration -->
            <td
              class="px-4 py-3 text-gray-600 dark:text-gray-300 whitespace-nowrap"
            >
              {{ duration(job) }}
            </td>

            <!-- Details column -->
            <td
              class="px-4 py-3 text-gray-600 dark:text-gray-300 max-w-[400px]"
            >
              <template v-if="job.status === 'failed' && job.error_message">
                <div class="flex items-start gap-1.5">
                  <span
                    class="text-red-500 dark:text-red-400 truncate"
                    :title="job.error_message"
                    >{{ job.error_message }}</span
                  >
                  <JsonPopover
                    v-if="job.error_message.length > 80"
                    :content="job.error_message"
                    title="Full error"
                    trigger-label="full"
                    trigger-class="!text-red-500 !border-red-200 dark:!border-red-800/40 hover:!bg-red-50 dark:hover:!bg-red-900/20"
                    data-testid="job-error-full-popover"
                  />
                </div>
              </template>
              <template v-else-if="job.status === 'running'">
                <span v-if="job.progress_total > 0"
                  >{{ job.progress_current }}/{{ job.progress_total }}</span
                >
                <span v-else class="text-violet-500">Running...</span>
              </template>
              <template v-else-if="job.status === 'succeeded' && job.result">
                <!-- Static summary when nothing extra to reveal -->
                <div
                  v-if="!isExpandable(job)"
                  class="truncate"
                  :data-testid="`job-details-static-${job.id}`"
                >
                  {{ resultSummary(job.result, job.type as JobType) }}
                </div>
                <button
                  v-else
                  type="button"
                  class="text-left w-full group"
                  :data-testid="`job-details-toggle-${job.id}`"
                  @click="toggleExpand(job.id)"
                >
                  <!-- Collapsed summary -->
                  <div
                    v-if="!expandedRows.has(job.id)"
                    class="truncate group-hover:text-gray-700 dark:group-hover:text-gray-200 cursor-pointer"
                  >
                    {{ resultSummary(job.result, job.type as JobType) }}
                    <span
                      class="ml-1 text-xs text-gray-400 dark:text-gray-500 group-hover:text-violet-500"
                      >...</span
                    >
                  </div>

                  <!-- Expanded details (text-sm to match table) -->
                  <dl
                    v-else
                    class="space-y-0.5 cursor-pointer"
                    data-testid="expanded-details"
                  >
                    <div
                      v-for="[k, v] in visibleResultEntries(job.result)"
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

                    <!-- Follow-up job statuses -->
                    <div
                      v-if="followUpStatuses[job.id]"
                      class="flex gap-2 pt-1 mt-1 border-t border-gray-100 dark:border-gray-700/40"
                      data-testid="follow-up-jobs"
                    >
                      <dt
                        class="font-medium text-gray-600 dark:text-gray-300 whitespace-nowrap"
                      >
                        Follow-ups:
                      </dt>
                      <dd class="flex flex-wrap gap-1.5">
                        <span
                          v-for="(fj, label) in followUpStatuses[job.id]"
                          :key="label"
                          class="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-medium"
                          :class="statusBadgeClass(fj.status)"
                          data-testid="follow-up-badge"
                        >
                          {{ formatResultKey(label) }}
                        </span>
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
      class="flex items-center justify-between mt-4 text-sm text-gray-600 dark:text-gray-300"
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
