<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import { RouterLink } from 'vue-router'
import {
  listJobs,
  getJob,
  type JobListParams,
  type JobListResponse,
} from '@/api/jobs'
import type { Job, JobType, JobStatus } from '@/types/job'
import { fetchPreferences, updatePreferences } from '@/api/preferences'
import {
  formatDurationSeconds,
  formatTokens,
  formatUsd,
} from '@/utils/format-metrics'
import JobParamsCell from '@/components/JobParamsCell.vue'
import JsonPopover from '@/components/JsonPopover.vue'
import { useInfiniteList } from '@/composables/useInfiniteList'

const jobs = ref<Job[]>([])
const total = ref(0)
const loading = ref(false)
const error = ref<string | null>(null)

const pageSize = 25
const filterStatus = ref<string>('')
const filterType = ref<string>('')
const searchQuery = ref<string>('')
const expandedRows = ref<Set<string>>(new Set())

/** Cached follow-up job statuses keyed by parent job ID */
const followUpStatuses = ref<
  Record<string, Record<string, { status: JobStatus; type: string }>>
>({})

// ── Column organisation ────────────────────────────────────────────
// Mirrors the show/hide + drag-reorder tool from EntryListView. Unlike
// EntryListView (plain-text cells) the job cells are rich, so the column
// engine only drives header labels/order and which per-key cell branch
// renders — the cell markup itself is preserved verbatim below.

interface ColumnDef {
  key: string
  label: string
  defaultVisible: boolean
  align: 'left' | 'center' | 'right'
}

const COLUMNS: ColumnDef[] = [
  { key: 'type', label: 'Type', defaultVisible: true, align: 'left' },
  { key: 'status', label: 'Status', defaultVisible: true, align: 'left' },
  { key: 'input_tokens', label: 'In', defaultVisible: true, align: 'left' },
  { key: 'output_tokens', label: 'Out', defaultVisible: true, align: 'left' },
  { key: 'cost', label: 'Cost', defaultVisible: true, align: 'left' },
  { key: 'entry', label: 'Entry', defaultVisible: true, align: 'left' },
  { key: 'created', label: 'Created', defaultVisible: true, align: 'left' },
  { key: 'duration', label: 'Duration', defaultVisible: true, align: 'left' },
  { key: 'params', label: 'Params', defaultVisible: false, align: 'left' },
  { key: 'details', label: 'Details', defaultVisible: true, align: 'left' },
]

const COLUMN_MAP: Record<string, ColumnDef> = Object.fromEntries(
  COLUMNS.map((c) => [c.key, c]),
)

const ALIGN_CLASSES: Record<string, string> = {
  left: 'text-left',
  center: 'text-center',
  right: 'text-right',
}

// Column visibility and order — persisted to server via user preferences
const DEFAULT_VISIBILITY = Object.fromEntries(
  COLUMNS.map((c) => [c.key, c.defaultVisible]),
)
const DEFAULT_ORDER = COLUMNS.map((c) => c.key)

const columnVisibility = ref<Record<string, boolean>>({ ...DEFAULT_VISIBILITY })
const columnOrder = ref<string[]>([...DEFAULT_ORDER])
const showColumnMenu = ref(false)

function isVisible(key: string): boolean {
  return columnVisibility.value[key] ?? true
}

// Debounced save to server
let _saveTimer: ReturnType<typeof setTimeout> | null = null

function _persistColumnPrefs(): void {
  if (_saveTimer) clearTimeout(_saveTimer)
  _saveTimer = setTimeout(() => {
    updatePreferences({
      job_list_columns: {
        visibility: columnVisibility.value,
        order: columnOrder.value,
      },
    }).catch(() => {
      // Silent — prefs are still in-memory, will retry on next change.
    })
  }, 500)
}

async function loadColumnPrefs(): Promise<void> {
  try {
    const { preferences } = await fetchPreferences()
    const prefs = preferences.job_list_columns as
      | { visibility?: Record<string, boolean>; order?: string[] }
      | undefined
    if (prefs) {
      if (prefs.visibility) {
        // Merge with defaults so new columns get their default visibility
        columnVisibility.value = { ...DEFAULT_VISIBILITY, ...prefs.visibility }
      }
      if (prefs.order) {
        const validKeys = new Set(DEFAULT_ORDER)
        const filtered = prefs.order.filter((k: string) => validKeys.has(k))
        const missing = DEFAULT_ORDER.filter((k) => !filtered.includes(k))
        columnOrder.value = [...filtered, ...missing]
      }
    }
  } catch {
    // Preferences endpoint not available — use defaults.
  }
}

function toggleColumn(key: string) {
  columnVisibility.value[key] = !columnVisibility.value[key]
  _persistColumnPrefs()
}

const orderedColumns = computed(() =>
  columnOrder.value.map((key) => COLUMN_MAP[key]).filter(Boolean),
)

const visibleOrderedColumns = computed(() =>
  orderedColumns.value.filter((col) => isVisible(col.key)),
)

// Drag-and-drop state for column reordering
const dragIndex = ref<number | null>(null)
const dragOverIndex = ref<number | null>(null)

function onDragStart(e: DragEvent, index: number) {
  dragIndex.value = index
  if (e.dataTransfer) {
    e.dataTransfer.effectAllowed = 'move'
  }
}

function onDragOver(e: DragEvent, index: number) {
  e.preventDefault()
  if (e.dataTransfer) {
    e.dataTransfer.dropEffect = 'move'
  }
  dragOverIndex.value = index
}

function onDrop(e: DragEvent, index: number) {
  e.preventDefault()
  if (dragIndex.value === null || dragIndex.value === index) return
  const order = [...columnOrder.value]
  const [moved] = order.splice(dragIndex.value, 1)
  order.splice(index, 0, moved)
  columnOrder.value = order
  _persistColumnPrefs()
  dragIndex.value = null
  dragOverIndex.value = null
}

function onDragEnd() {
  dragIndex.value = null
  dragOverIndex.value = null
}

function resetColumns() {
  columnVisibility.value = { ...DEFAULT_VISIBILITY }
  columnOrder.value = [...DEFAULT_ORDER]
  _persistColumnPrefs()
}

// Close column menu on outside click
function onDocumentClick(e: MouseEvent) {
  if (!showColumnMenu.value) return
  const target = e.target as Node
  const container = document.querySelector(
    '[data-testid="columns-button"]',
  )?.parentElement
  if (container && !container.contains(target)) {
    showColumnMenu.value = false
  }
}

/** Per-column `<td>` classes, preserving the original cell styling. */
function tdClass(col: ColumnDef): string {
  switch (col.key) {
    case 'type':
      return 'px-4 py-3 whitespace-nowrap'
    case 'status':
      return 'px-4 py-3'
    case 'input_tokens':
    case 'output_tokens':
    case 'cost':
      return 'px-4 py-3 text-gray-600 dark:text-gray-300 whitespace-nowrap tabular-nums'
    case 'entry':
    case 'created':
    case 'duration':
      return 'px-4 py-3 text-gray-600 dark:text-gray-300 whitespace-nowrap'
    case 'params':
      return 'px-4 py-3 text-gray-600 dark:text-gray-300 align-middle'
    case 'details':
      return 'px-4 py-3 text-gray-600 dark:text-gray-300 max-w-[400px]'
    default:
      return 'px-4 py-3'
  }
}

/** Preserve the per-cell token/cost testids on the `<td>`. */
function tdTestId(col: ColumnDef, job: Job): string | undefined {
  switch (col.key) {
    case 'input_tokens':
      return `job-input-tokens-${job.id}`
    case 'output_tokens':
      return `job-output-tokens-${job.id}`
    case 'cost':
      return `job-cost-${job.id}`
    default:
      return undefined
  }
}

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

// True while more rows exist server-side than are currently loaded.
const hasMore = computed(() => jobs.value.length < total.value)

/** Build the current status/type/search filter params (composed together). */
function currentFilterParams(): JobListParams {
  const params: JobListParams = {}
  if (filterStatus.value) params.status = filterStatus.value
  if (filterType.value) params.type = filterType.value
  const s = searchQuery.value.trim()
  if (s) params.search = s
  return params
}

// Initial load / filter (status, type, search) change — replaces the list
// from offset 0. This is the offset-reset path: any filter change starts a
// fresh window from the top.
async function load() {
  loading.value = true
  error.value = null
  try {
    const resp: JobListResponse = await listJobs({
      ...currentFilterParams(),
      limit: pageSize,
      offset: 0,
    })
    jobs.value = resp.items
    total.value = resp.total
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Failed to load jobs'
  } finally {
    loading.value = false
  }
}

// Infinite-scroll append — fetches the next page from `jobs.length` and
// PUSHES onto the array rather than replacing it.
async function loadMoreJobs() {
  loading.value = true
  error.value = null
  try {
    const resp: JobListResponse = await listJobs({
      ...currentFilterParams(),
      limit: pageSize,
      offset: jobs.value.length,
    })
    jobs.value = [...jobs.value, ...resp.items]
    total.value = resp.total
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Failed to load jobs'
  } finally {
    loading.value = false
  }
}

// ── Auto-poll refresh strategy ─────────────────────────────────────
// The 3s poll must update the status/progress of already-loaded jobs
// WITHOUT duplicating or dropping rows or collapsing the scroll position.
// Approach: re-fetch the currently-loaded window (offset 0, limit = number
// of loaded rows) with the same filters and REPLACE the array in place, so
// row count and order are preserved and only cell contents change.
//
// Race guard: this and `loadMoreJobs` both fetch, and appending while a
// poll replace is mid-flight (or vice versa) could double-append or drop
// rows. Both paths are gated on the shared `loading` flag — the poll bails
// if `loading` is set, and the "Load more" button / sentinel are disabled
// via `canLoadMore` (which includes `!loading`) — so the two never race.
async function refreshLoadedWindow() {
  if (loading.value) return
  loading.value = true
  try {
    const count = Math.max(jobs.value.length, pageSize)
    const resp: JobListResponse = await listJobs({
      ...currentFilterParams(),
      limit: count,
      offset: 0,
    })
    jobs.value = resp.items
    total.value = resp.total
  } catch {
    // A transient poll failure keeps the last-known list rather than
    // surfacing an error banner over a working view.
  } finally {
    loading.value = false
  }
}

// Infinite scroll: the bottom sentinel auto-appends when scrolled into
// view; the visible "Load more" button drives the same append as a
// fallback. Gated on hasMore + !loading so appends can't race the poll.
const { sentinelRef, loadMore, canLoadMore } = useInfiniteList({
  loadMore: () => loadMoreJobs(),
  canLoadMore: () => hasMore.value && !loading.value,
})

// Any filter change (status/type dropdowns) resets to a fresh window.
watch([filterStatus, filterType], () => {
  load()
})

// Debounce the free-text search so we fire one request per pause, not per
// keystroke. Resets the offset (load() always fetches from 0).
let searchDebounce: ReturnType<typeof setTimeout> | null = null
watch(searchQuery, () => {
  if (searchDebounce) clearTimeout(searchDebounce)
  searchDebounce = setTimeout(() => {
    load()
  }, 250)
})

// ── Live clock + auto-poll ─────────────────────────────────────────
// A running job's elapsed time must tick every second and the list must
// refresh itself while work is in flight, so the user can watch a job
// progress (or spot a stall) without hitting Refresh.

/** A job running longer than this reads as stuck and turns amber. */
const STUCK_THRESHOLD_SECONDS = 120

/** Ticks once a second so `liveDuration`/`isStuck` re-render live. */
const now = ref(Date.now())
let clockTimer: ReturnType<typeof setInterval> | null = null
let pollTimer: ReturnType<typeof setInterval> | null = null

/** True while any loaded job is still queued or running. */
const hasRunningJob = computed(() =>
  jobs.value.some((j) => j.status === 'running' || j.status === 'queued'),
)

/** Seconds a running job has been executing, or null if not started. */
function elapsedSeconds(job: Job): number | null {
  if (!job.started_at) return null
  const started = Date.parse(job.started_at)
  if (Number.isNaN(started)) return null
  return (now.value - started) / 1000
}

/** Live, up-counting duration string for a running job ("12s", "1m 04s"). */
function liveDuration(job: Job): string {
  const secs = elapsedSeconds(job)
  if (secs == null) return '-'
  return formatDurationSeconds(secs)
}

/** A running job that has been going long enough to look stuck. */
function isStuck(job: Job): boolean {
  if (job.status !== 'running') return false
  const secs = elapsedSeconds(job)
  return secs != null && secs > STUCK_THRESHOLD_SECONDS
}

onMounted(() => {
  load()
  loadColumnPrefs()
  document.addEventListener('click', onDocumentClick)
  clockTimer = setInterval(() => {
    now.value = Date.now()
  }, 1000)
  pollTimer = setInterval(() => {
    if (hasRunningJob.value && !loading.value) refreshLoadedWindow()
  }, 3000)
})

onUnmounted(() => {
  document.removeEventListener('click', onDocumentClick)
  if (clockTimer != null) clearInterval(clockTimer)
  if (pollTimer != null) clearInterval(pollTimer)
})

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
      // Ring makes failures pop out of the list — this view is how the
      // user spots a failed job (and, in future, an out-of-credits state).
      return 'bg-red-100 text-red-700 ring-1 ring-red-400/60 dark:bg-red-500/20 dark:text-red-300 dark:ring-red-500/40'
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
    <div
      class="flex flex-wrap items-center gap-3 mb-4"
      data-testid="job-history-filters"
    >
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

      <input
        v-model="searchQuery"
        type="search"
        placeholder="Search jobs…"
        data-testid="jobs-search-input"
        class="text-sm w-56 rounded-lg border-gray-200 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200 px-3 py-1.5"
      />

      <button
        type="button"
        class="text-sm text-violet-600 dark:text-violet-400 hover:underline"
        data-testid="refresh-button"
        @click="load"
      >
        Refresh
      </button>

      <!-- Column visibility and order menu -->
      <div class="relative ml-auto">
        <button
          class="btn bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700/60 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 px-3 py-2 rounded-lg text-sm font-medium flex items-center gap-1.5"
          data-testid="columns-button"
          @click="showColumnMenu = !showColumnMenu"
        >
          <svg
            class="w-4 h-4"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            viewBox="0 0 24 24"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              d="M9 4h6m-6 4h6m-6 4h6m-6 4h6M4 4v16m16-16v16"
            />
          </svg>
          Columns
        </button>
        <div
          v-if="showColumnMenu"
          class="absolute right-0 mt-1 w-56 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700/60 rounded-lg shadow-lg z-40 py-1"
          data-testid="columns-menu"
        >
          <div
            v-for="(col, index) in orderedColumns"
            :key="col.key"
            class="flex items-center gap-2 px-3 py-1.5 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700/50"
            :class="{
              'border-t-2 border-violet-400':
                dragOverIndex === index &&
                dragIndex !== null &&
                dragIndex !== index,
              'opacity-50': dragIndex === index,
            }"
            draggable="true"
            :data-testid="`col-item-${col.key}`"
            @dragstart="onDragStart($event, index)"
            @dragover="onDragOver($event, index)"
            @drop="onDrop($event, index)"
            @dragend="onDragEnd"
          >
            <!-- Drag handle for column reordering -->
            <svg
              class="w-4 h-4 text-gray-400 cursor-grab shrink-0"
              data-testid="drag-handle"
              fill="currentColor"
              viewBox="0 0 24 24"
            >
              <circle cx="9" cy="5" r="1.5" />
              <circle cx="15" cy="5" r="1.5" />
              <circle cx="9" cy="12" r="1.5" />
              <circle cx="15" cy="12" r="1.5" />
              <circle cx="9" cy="19" r="1.5" />
              <circle cx="15" cy="19" r="1.5" />
            </svg>
            <label class="flex items-center gap-2 cursor-pointer flex-1">
              <input
                type="checkbox"
                :checked="isVisible(col.key)"
                class="form-checkbox rounded text-violet-500"
                :data-testid="`col-toggle-${col.key}`"
                @change="toggleColumn(col.key)"
              />
              {{ col.label }}
            </label>
          </div>
          <div
            class="border-t border-gray-200 dark:border-gray-700/60 mt-1 pt-1"
          >
            <button
              class="w-full text-left px-3 py-1.5 text-sm text-violet-600 dark:text-violet-400 hover:bg-gray-50 dark:hover:bg-gray-700/50"
              data-testid="columns-reset"
              @click="resetColumns"
            >
              Reset to defaults
            </button>
          </div>
        </div>
      </div>
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

    <!-- Table (tablet & desktop) + cards (mobile) -->
    <template v-else>
      <div
        class="hidden sm:block overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-700/60"
      >
        <table class="w-full text-sm" data-testid="job-history-table">
          <thead>
            <tr
              class="bg-gray-50 dark:bg-gray-800/60 text-left text-xs font-medium text-gray-600 dark:text-gray-300 uppercase tracking-wider"
            >
              <th
                v-for="col in visibleOrderedColumns"
                :key="col.key"
                class="px-4 py-3 whitespace-nowrap"
                :class="ALIGN_CLASSES[col.align]"
                :data-testid="`col-header-${col.key}`"
              >
                {{ col.label }}
              </th>
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
                v-for="col in visibleOrderedColumns"
                :key="col.key"
                :class="tdClass(col)"
                :data-testid="tdTestId(col, job)"
              >
                <!-- Type column with color badge -->
                <template v-if="col.key === 'type'">
                  <span
                    class="inline-block px-2 py-0.5 rounded-full text-xs font-medium"
                    :class="typeBadgeClass(job.type as JobType)"
                    data-testid="type-badge"
                  >
                    {{ jobLabel(job.type as JobType) }}
                  </span>
                </template>

                <!-- Status badge -->
                <template v-else-if="col.key === 'status'">
                  <span
                    class="inline-block px-2 py-0.5 rounded-full text-xs font-medium capitalize"
                    :class="statusBadgeClass(job.status as JobStatus)"
                  >
                    {{ job.status }}
                  </span>
                </template>

                <!-- Input tokens -->
                <template v-else-if="col.key === 'input_tokens'">
                  {{ formatTokens(job.input_tokens) }}
                </template>

                <!-- Output tokens -->
                <template v-else-if="col.key === 'output_tokens'">
                  {{ formatTokens(job.output_tokens) }}
                </template>

                <!-- Cost -->
                <template v-else-if="col.key === 'cost'">
                  {{ formatUsd(job.cost_usd) }}
                </template>

                <!-- Entry column (clickable link) -->
                <template v-else-if="col.key === 'entry'">
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
                </template>

                <!-- Created column with relative time -->
                <template v-else-if="col.key === 'created'">
                  <span>{{ formatTime(job.created_at) }}</span>
                  <span
                    v-if="relativeTime(job.created_at)"
                    class="ml-1.5 text-xs text-gray-400 dark:text-gray-500"
                    data-testid="relative-time"
                  >
                    {{ relativeTime(job.created_at) }}
                  </span>
                </template>

                <!-- Duration (live up-counter + spinner while running) -->
                <template v-else-if="col.key === 'duration'">
                  <span
                    v-if="job.status === 'running'"
                    class="inline-flex items-center font-medium tabular-nums"
                    :class="
                      isStuck(job)
                        ? 'text-amber-600 dark:text-amber-400'
                        : 'text-violet-600 dark:text-violet-400'
                    "
                    :data-testid="`live-duration-${job.id}`"
                  >
                    <svg
                      class="animate-spin w-4 h-4 mr-1.5 -ml-0.5"
                      :data-testid="`job-spinner-${job.id}`"
                      xmlns="http://www.w3.org/2000/svg"
                      fill="none"
                      viewBox="0 0 24 24"
                    >
                      <circle
                        class="opacity-25"
                        cx="12"
                        cy="12"
                        r="10"
                        stroke="currentColor"
                        stroke-width="4"
                      />
                      <path
                        class="opacity-75"
                        fill="currentColor"
                        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                      />
                    </svg>
                    {{ liveDuration(job) }}
                  </span>
                  <span v-else>{{ duration(job) }}</span>
                </template>

                <!-- Params column (no longer shows entry_id — that's in Entry column) -->
                <template v-else-if="col.key === 'params'">
                  <JobParamsCell :job="job" />
                </template>

                <!-- Details column -->
                <template v-else-if="col.key === 'details'">
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
                  <template
                    v-else-if="job.status === 'succeeded' && job.result"
                  >
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
                </template>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- Cards: mobile (stacked) -->
      <ul class="sm:hidden space-y-3" data-testid="job-card-list">
        <li
          v-for="job in jobs"
          :key="job.id"
          class="rounded-lg border border-gray-200 dark:border-gray-700/60 bg-white dark:bg-gray-900/40 p-4"
          :data-testid="`job-card-${job.id}`"
        >
          <div class="flex items-center justify-between gap-2 flex-wrap">
            <span
              v-if="isVisible('type')"
              class="inline-block px-2 py-0.5 rounded-full text-xs font-medium"
              :class="typeBadgeClass(job.type as JobType)"
            >
              {{ jobLabel(job.type as JobType) }}
            </span>
            <span
              v-if="isVisible('status')"
              class="inline-block px-2 py-0.5 rounded-full text-xs font-medium capitalize"
              :class="statusBadgeClass(job.status as JobStatus)"
            >
              {{ job.status }}
            </span>
          </div>

          <div
            class="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-gray-500 dark:text-gray-400"
          >
            <span v-if="isVisible('entry')">
              Entry:
              <RouterLink
                v-if="entryId(job) != null"
                :to="{
                  name: 'entry-detail',
                  params: { id: String(entryId(job)) },
                }"
                class="text-violet-600 dark:text-violet-400 hover:underline"
                data-testid="card-entry-link"
              >
                #{{ entryId(job) }}
              </RouterLink>
              <span v-else>-</span>
            </span>
            <span v-if="isVisible('created')">{{
              formatTime(job.created_at)
            }}</span>
            <!-- A running job always shows its live duration on the card,
                 even if the Duration column is hidden, so progress stays
                 visible on mobile. -->
            <span
              v-if="job.status === 'running'"
              class="inline-flex items-center font-medium"
              :class="
                isStuck(job)
                  ? 'text-amber-600 dark:text-amber-400'
                  : 'text-violet-600 dark:text-violet-400'
              "
              :data-testid="`card-live-duration-${job.id}`"
            >
              <svg
                class="animate-spin w-3 h-3 mr-1"
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
              >
                <circle
                  class="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  stroke-width="4"
                />
                <path
                  class="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                />
              </svg>
              {{ liveDuration(job) }}
            </span>
            <span v-else-if="isVisible('duration') && duration(job) !== '-'"
              >· {{ duration(job) }}</span
            >
          </div>

          <div
            v-if="
              (isVisible('input_tokens') ||
                isVisible('output_tokens') ||
                isVisible('cost')) &&
              (job.input_tokens != null ||
                job.output_tokens != null ||
                job.cost_usd != null)
            "
            class="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-gray-500 dark:text-gray-400 tabular-nums"
            :data-testid="`card-metrics-${job.id}`"
          >
            <span v-if="isVisible('input_tokens')"
              >In: {{ formatTokens(job.input_tokens) }}</span
            >
            <span v-if="isVisible('output_tokens')"
              >Out: {{ formatTokens(job.output_tokens) }}</span
            >
            <span v-if="isVisible('cost')"
              >Cost: {{ formatUsd(job.cost_usd) }}</span
            >
          </div>

          <div
            v-if="isVisible('params')"
            class="mt-2 text-sm text-gray-600 dark:text-gray-300"
          >
            <JobParamsCell :job="job" />
          </div>

          <div v-if="isVisible('details')" class="mt-1 text-sm">
            <template v-if="job.status === 'failed' && job.error_message">
              <span class="text-red-500 dark:text-red-400 break-words">{{
                job.error_message
              }}</span>
            </template>
            <template v-else-if="job.status === 'running'">
              <span
                v-if="job.progress_total > 0"
                class="text-gray-600 dark:text-gray-300"
                >{{ job.progress_current }}/{{ job.progress_total }}</span
              >
              <span v-else class="text-violet-500">Running...</span>
            </template>
            <template v-else-if="job.status === 'succeeded' && job.result">
              <span class="text-gray-600 dark:text-gray-300 break-words">{{
                resultSummary(job.result, job.type as JobType)
              }}</span>
            </template>
          </div>
        </li>
      </ul>
    </template>

    <!-- Infinite scroll: count caption + manual "Load more" + sentinel -->
    <div
      v-if="jobs.length > 0"
      class="mt-4 flex flex-col items-center gap-3 text-sm text-gray-600 dark:text-gray-300"
    >
      <div data-testid="jobs-count-caption">
        showing {{ jobs.length }} of {{ total }}
      </div>
      <button
        v-if="hasMore"
        type="button"
        class="btn bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700/60 text-gray-600 dark:text-gray-300 disabled:opacity-50 disabled:cursor-not-allowed"
        :disabled="!canLoadMore"
        data-testid="jobs-load-more"
        @click="loadMore"
      >
        {{ loading ? 'Loading…' : 'Load more' }}
      </button>
      <!-- Bottom sentinel: intersects → auto-append when scrolled into view. -->
      <div ref="sentinelRef" data-testid="jobs-scroll-sentinel"></div>
    </div>
  </div>
</template>
