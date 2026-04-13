<script setup lang="ts">
import { computed, onMounted, onBeforeUnmount, ref, nextTick, watch } from 'vue'
import { useRoute, useRouter, onBeforeRouteLeave } from 'vue-router'
import { useEntriesStore } from '@/stores/entries'
import { useJobsStore } from '@/stores/jobs'
import { isTerminal } from '@/types/job'
import { useEntryEditor } from '@/composables/useEntryEditor'
import { useDiffHighlight } from '@/composables/useDiffHighlight'
import {
  useOverlayHighlight,
  type OverlayMode,
} from '@/composables/useOverlayHighlight'
import { fetchEntryChunks, fetchEntryTokens } from '@/api/entries'
import { fetchEntryEntities } from '@/api/entities'
import { ApiRequestError } from '@/api/client'
import type { Chunk, TokenSpan, UncertainSpan } from '@/types/entry'
import type { EntryEntityRef, EntityType } from '@/types/entity'

const props = defineProps<{
  id: string
}>()

const router = useRouter()
const route = useRoute()
const store = useEntriesStore()
const jobsStore = useJobsStore()
const { editedText, saving, saveError, isDirty, isModified, reset } =
  useEntryEditor(() => store.currentEntry)

const deleting = ref(false)
const deleteError = ref<string | null>(null)

// View mode: 'read' for pleasant single-pane reading, 'edit' for two-pane editor.
// Default depends on whether the entry has been corrected before.
type ViewMode = 'read' | 'edit'
const viewMode = ref<ViewMode>('edit')
const viewModeDefaultSet = ref(false)

// Set default view mode once per entry load. We watch the entry's id
// (not isModified) so this fires exactly once per navigation. A
// follow-up tick via nextTick ensures the entry's text fields have
// settled before reading isModified.
watch(
  () => store.currentEntry?.id,
  async (id) => {
    if (id == null) return
    viewModeDefaultSet.value = false
    await nextTick()
    viewMode.value = isModified.value ? 'read' : 'edit'
    viewModeDefaultSet.value = true
  },
)

// Date editing
const editingDate = ref(false)
const editedDate = ref('')
const savingDate = ref(false)

function startEditDate() {
  if (store.currentEntry) {
    editedDate.value = store.currentEntry.entry_date
    editingDate.value = true
  }
}

async function saveDate() {
  if (
    !store.currentEntry ||
    editedDate.value === store.currentEntry.entry_date
  ) {
    editingDate.value = false
    return
  }
  savingDate.value = true
  try {
    await store.updateDate(store.currentEntry.id, editedDate.value)
    editingDate.value = false
  } catch {
    // error shown via store.error
  } finally {
    savingDate.value = false
  }
}

function cancelEditDate() {
  editingDate.value = false
}

// Original text as a reactive ref the composable can watch. Coerce
// null/undefined to '' so the diff composable always sees a string
// — a null here used to propagate all the way into diff-match-patch
// which throws "Null input" and blanked the view.
const originalText = ref('')
watch(
  () => store.currentEntry?.raw_text,
  (t) => {
    if (t !== undefined) originalText.value = t ?? ''
  },
  { immediate: true },
)

// Toggle for the live diff highlighting. Defaults to on.
const showDiff = ref(true)

// OCR uncertainty ("Review") toggle. Highlights the words that the
// OCR model flagged as uncertain at ingestion time, overlaid on the
// Original OCR panel only. Defaults to off — the toggle is disabled
// in the template when the current entry has no uncertain spans
// recorded (old entries, or clean pages), so users don't waste a
// click on an inert control.
const showReview = ref(false)
const uncertainSpans = computed<UncertainSpan[]>(
  () => store.currentEntry?.uncertain_spans ?? [],
)
const hasUncertainSpans = computed(() => uncertainSpans.value.length > 0)

// Reset the toggle when switching entries — the new entry may not
// have any spans, and carrying the old toggle state into it would be
// confusing.
watch(
  () => store.currentEntry?.id,
  () => {
    showReview.value = false
  },
)

const { originalHtml: rawOriginalHtml, correctedHtml: rawCorrectedHtml } =
  useDiffHighlight(originalText, editedText, showDiff, {
    showReview,
    uncertainSpans,
  })

// Entity highlight — from ?highlight= query param or from clicking a chip.
// We track the selected entity by ID so we can use its quotes + aliases for
// matching, not just the canonical_name.
const selectedEntityId = ref<number | null>(null)

const highlightTerms = computed<string[]>(() => {
  // Query-param highlight is a simple single-term fallback
  const qp = (route.query.highlight as string | undefined) || ''
  if (qp) return [qp]

  if (selectedEntityId.value === null) return []
  const chip = entryEntities.value.find((e) => e.id === selectedEntityId.value)
  if (!chip) return []

  // Combine canonical_name, aliases, and quotes — deduplicated
  const terms = new Set<string>()
  terms.add(chip.canonical_name)
  for (const a of chip.aliases ?? []) terms.add(a)
  for (const q of chip.quotes ?? []) terms.add(q)
  // Filter empties, sort longest-first so longer quotes match before substrings
  return [...terms]
    .filter((t) => t.length > 0)
    .sort((a, b) => b.length - a.length)
})

function toggleEntityHighlight(chip: EntryEntityRef) {
  selectedEntityId.value = selectedEntityId.value === chip.id ? null : chip.id
}

function escapeForHighlight(term: string): string {
  // HTML-escape must match segmentsToHtml's escapeHtml() so the regex
  // finds the entity term in the already-escaped HTML text nodes.
  return term
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
    .replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function applyEntityHighlight(html: string, terms: string[]): string {
  if (!terms.length) return html
  const pattern = terms.map(escapeForHighlight).join('|')
  const regex = new RegExp(`(${pattern})`, 'gi')
  // Replace only within text nodes — skip HTML tags entirely. The
  // alternation matches either a full tag (<...>) or a text run; the
  // callback only transforms text runs.
  return html.replace(
    /(<[^>]*>)|([^<]+)/g,
    (_match, tag: string | undefined, text: string | undefined) => {
      if (tag) return tag
      return (text ?? '').replace(
        regex,
        '<mark class="bg-violet-200 dark:bg-violet-500/30 rounded-sm">$1</mark>',
      )
    },
  )
}

const originalHtml = computed(() =>
  applyEntityHighlight(rawOriginalHtml.value, highlightTerms.value),
)
const correctedHtml = computed(() =>
  applyEntityHighlight(rawCorrectedHtml.value, highlightTerms.value),
)

// Reading mode: render editedText (which includes unsaved edits) with entity
// highlighting. Plain text → escaped HTML → entity marks.
function textToHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}
const readingHtml = computed(() =>
  applyEntityHighlight(textToHtml(editedText.value), highlightTerms.value),
)

// Scroll to the first <mark> after entity highlight changes
const textPanelsRef = ref<HTMLElement | null>(null)
watch(selectedEntityId, async (id) => {
  if (id === null) return
  await nextTick()
  // Wait one more frame for v-html to finish rendering
  await nextTick()
  const container =
    textPanelsRef.value ?? document.querySelector('.entry-detail')
  const mark = container?.querySelector('mark')
  if (mark) {
    mark.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }
})

// -- Overlay feature (chunks / tokens) -----------------------------------
// The overlay renders against the persisted final_text — NOT editedText —
// because chunks carry char offsets into the server's stored text. While
// the overlay is active the corrected panel is read-only so the user
// cannot silently desync the text from the offsets. Turning overlay off
// restores the normal diff-editor view, including any unsaved edits.
const overlayMode = ref<OverlayMode>('off')
const chunks = ref<Chunk[] | null>(null)
const tokens = ref<TokenSpan[] | null>(null)
const overlayError = ref<string | null>(null)
const overlayLoading = ref(false)

const persistedText = computed(() => store.currentEntry?.final_text ?? '')

const { overlayHtml } = useOverlayHighlight({
  text: persistedText,
  mode: overlayMode,
  chunks,
  tokens,
})

// Clear overlay caches whenever we switch to a different entry — cached
// chunks/tokens belong to the previous entry and must not be reused.
watch(
  () => store.currentEntry?.id,
  () => {
    chunks.value = null
    tokens.value = null
    overlayError.value = null
    overlayMode.value = 'off'
  },
)

// Deep-link scroll target. When the view is opened from SearchView
// with `?chunk=N`, remember the index and enable chunks overlay mode
// so the chunk badges render. After the chunks load, a second
// watcher below finds the badge in the DOM and scrolls it into view.
//
// This watch is defined AFTER the reset watch above so Vue fires
// the reset first on a fresh navigation (clearing any stale state)
// and then this one, which re-sets overlayMode to `chunks` once we
// have a loaded entry to operate on. Both the route query param
// and the loaded entry id are reactive dependencies so changing
// either (e.g., clicking a different search result into the same
// entry detail view) re-arms the scroll target.
//
// Deliberately NOT using `immediate: true`: a fresh mount where
// `store.currentEntry` still holds a stale entry from a previous
// view would otherwise fire synchronously against the wrong
// entry id and start fetching its chunks before `store.loadEntry`
// resolves for the new entry. Waiting for `currentEntry.id` to
// actually change gives the reset watcher a clean handoff.
const pendingScrollChunk = ref<number | null>(null)

watch(
  [() => route.query.chunk, () => store.currentEntry?.id],
  ([chunkParam, entryId]) => {
    if (!entryId) return
    if (typeof chunkParam !== 'string') return
    const n = Number(chunkParam)
    if (!Number.isFinite(n) || n < 0) return
    pendingScrollChunk.value = n
    overlayMode.value = 'chunks'
  },
)

// Once chunks load (and the overlayHtml re-renders with chunk badges
// in the DOM), scroll the target badge into view and clear the
// pending target so save/reload cycles don't re-scroll. Guard on
// `pendingScrollChunk` so this watch is a no-op when the user isn't
// deep-linking from search.
watch(chunks, async (c) => {
  if (c === null) return
  if (pendingScrollChunk.value === null) return
  const target = pendingScrollChunk.value
  pendingScrollChunk.value = null
  // Two ticks: one for Vue to flush overlayHtml into the DOM, one
  // extra to be safe in test environments where v-html sometimes
  // lands on the following microtask.
  await nextTick()
  await nextTick()
  if (typeof document === 'undefined') return
  const el = document.querySelector(`[aria-label="chunk ${target} start"]`)
  if (el instanceof HTMLElement) {
    el.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }
})

// Lazy fetch: on first switch to a mode, fetch the data for it and cache
// it on the view. Subsequent switches off→on re-use the cached data.
watch(overlayMode, async (mode) => {
  overlayError.value = null
  if (mode === 'off') return
  const entry = store.currentEntry
  if (!entry) return

  overlayLoading.value = true
  try {
    if (mode === 'chunks' && chunks.value === null) {
      try {
        const resp = await fetchEntryChunks(entry.id)
        chunks.value = resp.chunks
      } catch (e) {
        if (
          e instanceof ApiRequestError &&
          e.errorCode === 'chunks_not_backfilled'
        ) {
          overlayError.value = e.message
        } else {
          overlayError.value =
            e instanceof Error ? e.message : 'Failed to load chunks'
        }
      }
    } else if (mode === 'tokens' && tokens.value === null) {
      try {
        const resp = await fetchEntryTokens(entry.id)
        tokens.value = resp.tokens
      } catch (e) {
        overlayError.value =
          e instanceof Error ? e.message : 'Failed to load tokens'
      }
    }
  } finally {
    overlayLoading.value = false
  }
})

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

// Entity chips shown in the header. Fetched lazily so the editor
// loads even if the extraction job hasn't run yet for this entry.
// Silently empty on failure (e.g. pre-extraction entries that return
// 404 from /api/entries/{id}/entities).
//
// The server returns `{entry_id, items, total}` — matching every
// other list endpoint. We used to read `resp.entities`, which at
// runtime was always `undefined`, and the template's
// `entryEntities.length` check then exploded and blanked out the
// whole EntryDetailView. The coalescing `?? []` assignment below
// is the belt to the type fix's braces: even if the server ships
// an off-contract payload tomorrow, `entryEntities` stays an
// array and the chip strip stays hidden rather than crashing.
const entryEntities = ref<EntryEntityRef[]>([])

async function loadEntryEntities(entryId: number) {
  try {
    const resp = await fetchEntryEntities(entryId)
    entryEntities.value = resp.items ?? []
  } catch {
    // Swallow — the strip just stays hidden if there's nothing to show.
    entryEntities.value = []
  }
}

function entityChipClass(type: EntityType): string {
  switch (type) {
    case 'person':
      return 'bg-violet-100 text-violet-700 dark:bg-violet-500/20 dark:text-violet-300'
    case 'place':
      return 'bg-sky-100 text-sky-700 dark:bg-sky-500/20 dark:text-sky-300'
    case 'activity':
      return 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300'
    case 'organization':
      return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-500/20 dark:text-yellow-300'
    case 'topic':
      return 'bg-rose-100 text-rose-700 dark:bg-rose-500/20 dark:text-rose-300'
    case 'other':
    default:
      return 'bg-gray-100 text-gray-700 dark:bg-gray-500/20 dark:text-gray-300'
  }
}

onMounted(() => {
  const entryId = Number(props.id)
  store.loadEntry(entryId)
  loadEntryEntities(entryId)
})

async function save() {
  if (!store.currentEntry || !isDirty.value) return
  saving.value = true
  saveError.value = null
  try {
    const entryId = store.currentEntry.id
    const extractionJobId = await store.saveEntryText(entryId, editedText.value)
    // Invalidate cached chunks/tokens — the server re-chunks and
    // re-embeds on save, so the previously-fetched offsets and token
    // spans no longer describe the persisted final_text. The next
    // overlay-mode flip will refetch fresh data. We do NOT touch
    // overlayMode itself: if the user was looking at chunks before
    // the save, the watch(overlayMode) effect won't refire, so we
    // leave the mode but null the cache so the panel will show the
    // overlay-display (backed by overlayHtml over persistedText)
    // with the stale-until-next-toggle gap that already existed and
    // was flagged as a minor UX issue, not a bug. The important bit
    // is that switching off→on now picks up fresh data rather than
    // showing the pre-save chunks.
    chunks.value = null
    tokens.value = null
    overlayError.value = null

    // Clear stale entity highlight and track the extraction job.
    // The notification UI shows progress; when the job finishes
    // we reload entity chips automatically.
    selectedEntityId.value = null
    if (extractionJobId) {
      jobsStore.trackJob(extractionJobId, 'entity_extraction', {
        entry_id: entryId,
      })
      const unwatch = watch(
        () => jobsStore.getJobById.value(extractionJobId),
        (job) => {
          if (job && isTerminal(job.status)) {
            unwatch()
            loadEntryEntities(entryId)
          }
        },
      )
    }
  } catch (e) {
    saveError.value = e instanceof Error ? e.message : 'Failed to save'
  } finally {
    saving.value = false
  }
}

function goBack() {
  router.push({ name: 'entries' })
}

async function confirmDelete() {
  if (!store.currentEntry || deleting.value) return
  const dateStr = formatDate(store.currentEntry.entry_date)
  const ok = window.confirm(
    `Delete the journal entry for ${dateStr}? This cannot be undone.`,
  )
  if (!ok) return

  deleting.value = true
  deleteError.value = null
  try {
    await store.deleteEntry(store.currentEntry.id)
    // Once the store clears currentEntry, isDirty flips to false, so
    // the onBeforeRouteLeave guard will let us navigate without a
    // second confirmation.
    router.push({ name: 'entries' })
  } catch (e) {
    deleteError.value = e instanceof Error ? e.message : 'Failed to delete'
  } finally {
    deleting.value = false
  }
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

    <!--
      The v-if/else-if chain below used to leave a gap: between
      setup() and the async onMounted -> loadEntry resolving, the
      store has `loading: false, error: null, currentEntry: null` for
      exactly one frame, and before this v-else was added none of the
      branches matched, leaving `<main>` completely empty. Worse, any
      throw inside the currentEntry subtree (e.g. `.toLocaleString()`
      on an undefined field) drops the whole template and the user
      sees the same blank page. Keeping an unconditional v-else here
      means there is always *some* chrome on screen and the blank-
      page failure mode is unreachable.
    -->
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
            <template v-if="editingDate">
              <input
                v-model="editedDate"
                type="date"
                class="form-input text-lg font-bold dark:bg-gray-700 dark:border-gray-600 dark:text-gray-100"
                data-testid="date-input"
                @keydown.enter="saveDate"
                @keydown.escape="cancelEditDate"
              />
              <button
                class="btn bg-violet-500 hover:bg-violet-600 text-white text-sm px-3 py-1"
                :disabled="savingDate"
                data-testid="date-save-button"
                @click="saveDate"
              >
                {{ savingDate ? 'Saving...' : 'Save' }}
              </button>
              <button
                class="btn bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700/60 text-gray-600 dark:text-gray-300 text-sm px-3 py-1"
                :disabled="savingDate"
                @click="cancelEditDate"
              >
                Cancel
              </button>
            </template>
            <h1
              v-else
              class="text-2xl md:text-3xl text-gray-800 dark:text-gray-100 font-bold cursor-pointer hover:text-violet-600 dark:hover:text-violet-400 transition-colors"
              title="Click to edit date"
              data-testid="entry-date-heading"
              @click="startEditDate"
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

          <!--
            Meta chips use optional-chaining + `?? 0` fallbacks because
            a single malformed field (missing word_count, etc.) used to
            throw inside this subtree and wipe out the entire view — the
            user ended up with a blank page because Vue's render bailed
            out of the <template v-else-if="store.currentEntry"> branch.
            The backend contract *should* always send these, but defensive
            coercion here means the detail view stays usable even if it
            doesn't.
          -->
          <div
            class="flex items-center gap-4 text-sm text-gray-500 dark:text-gray-400"
          >
            <span>{{
              (store.currentEntry.source_type ?? '').toUpperCase() || '—'
            }}</span>
            <span
              >{{
                (store.currentEntry.word_count ?? 0).toLocaleString()
              }}
              words</span
            >
            <span>{{ store.currentEntry.chunk_count ?? 0 }} chunks</span>
            <span>
              {{ store.currentEntry.page_count ?? 0 }} page{{
                (store.currentEntry.page_count ?? 0) !== 1 ? 's' : ''
              }}
            </span>
          </div>
        </div>

        <!-- Entity chips: lazy-fetched tags for entities extracted
             from this entry. Hidden when nothing has been extracted
             (e.g. before the user runs the batch extraction job).
             `entryEntities?.length` — not just `.length` — because
             a transiently-non-array value (the old contract-drift
             failure mode) must not throw during render. -->
        <div
          v-if="entryEntities?.length"
          class="flex flex-wrap gap-2 mt-3"
          data-testid="entry-entity-chips"
        >
          <button
            v-for="chip in entryEntities"
            :key="chip.id"
            class="inline-flex items-center gap-1 text-xs font-medium rounded-full px-2.5 py-0.5 capitalize transition-all cursor-pointer"
            :class="[
              entityChipClass(chip.entity_type),
              selectedEntityId === chip.id
                ? 'ring-2 ring-violet-500 ring-offset-1 dark:ring-offset-gray-800'
                : 'hover:opacity-80',
            ]"
            :title="`Highlight '${chip.canonical_name}' in the text`"
            :data-testid="`entry-entity-chip-${chip.id}`"
            @click="toggleEntityHighlight(chip)"
          >
            {{ chip.canonical_name }}
          </button>
        </div>

        <!-- View mode toggle: Read / Edit -->
        <div
          class="flex items-center gap-1 mt-3 text-sm select-none"
          data-testid="view-mode-group"
          role="radiogroup"
          aria-label="View mode"
        >
          <label
            v-for="m in ['read', 'edit'] as const"
            :key="m"
            class="cursor-pointer"
          >
            <input
              v-model="viewMode"
              type="radio"
              :value="m"
              name="view-mode"
              class="sr-only peer"
              :data-testid="`view-mode-radio-${m}`"
            />
            <span
              class="inline-block px-3 py-1 rounded text-sm font-medium border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 capitalize peer-checked:bg-violet-500 peer-checked:text-white peer-checked:border-violet-500 peer-focus-visible:ring-2 peer-focus-visible:ring-violet-400"
            >
              {{ m }}
            </span>
          </label>
        </div>
      </div>

      <!-- ============ READING MODE ============ -->
      <template v-if="viewMode === 'read'">
        <div class="flex justify-center">
          <div
            ref="textPanelsRef"
            class="w-full max-w-prose bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700/60 rounded-xl shadow-xs p-6 md:p-10"
          >
            <!-- eslint-disable vue/no-v-html -->
            <div
              class="reading-surface text-gray-800 dark:text-gray-200"
              data-testid="reading-display"
              v-html="readingHtml"
            />
            <!-- eslint-enable vue/no-v-html -->
          </div>
        </div>
      </template>

      <!-- ============ EDIT MODE ============ -->
      <template v-else>
        <!-- Save error banner -->
        <div
          v-if="saveError"
          class="mb-4 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 border border-red-200 dark:border-red-800/40 rounded-lg px-4 py-3 text-sm"
          data-testid="save-error-banner"
        >
          {{ saveError }}
        </div>

        <!-- Delete error banner -->
        <div
          v-if="deleteError"
          class="mb-4 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 border border-red-200 dark:border-red-800/40 rounded-lg px-4 py-3 text-sm"
          data-testid="delete-error-banner"
        >
          {{ deleteError }}
        </div>

        <!-- Overlay error banner (e.g. chunks_not_backfilled) -->
        <div
          v-if="overlayError"
          class="mb-4 bg-yellow-50 dark:bg-yellow-900/20 text-yellow-800 dark:text-yellow-300 border border-yellow-200 dark:border-yellow-800/40 rounded-lg px-4 py-3 text-sm"
          data-testid="overlay-error-banner"
        >
          {{ overlayError }}
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
            <!--
            Review toggle: overlays OCR uncertainty highlights on the
            Original OCR panel. Always clickable — when no uncertain
            spans exist, toggling it on shows an info banner instead
            of silently doing nothing.
          -->
            <label
              class="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-300 cursor-pointer select-none"
              title="Highlight words the OCR model flagged as uncertain"
              data-testid="review-toggle-label"
            >
              <input
                v-model="showReview"
                type="checkbox"
                class="form-checkbox rounded text-yellow-500 focus:ring-yellow-500"
                data-testid="review-toggle"
              />
              Review
            </label>
            <!--
            Overlay mode: segmented radio group. Renders chunk or token
            boundaries on top of the corrected panel. While active the
            textarea becomes read-only so edits can't drift away from the
            offsets the server returned.
          -->
            <div
              class="flex items-center gap-1 text-sm text-gray-600 dark:text-gray-300 select-none"
              data-testid="overlay-mode-group"
              role="radiogroup"
              aria-label="Overlay mode"
            >
              <span
                class="text-xs uppercase tracking-wider text-gray-400 dark:text-gray-500 mr-1"
              >
                Overlay
              </span>
              <label
                v-for="m in ['off', 'chunks', 'tokens'] as const"
                :key="m"
                class="cursor-pointer"
              >
                <input
                  v-model="overlayMode"
                  type="radio"
                  :value="m"
                  name="overlay-mode"
                  class="sr-only peer"
                  :data-testid="`overlay-radio-${m}`"
                />
                <span
                  class="inline-block px-2 py-0.5 rounded text-xs border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 peer-checked:bg-violet-500 peer-checked:text-white peer-checked:border-violet-500 peer-focus-visible:ring-2 peer-focus-visible:ring-violet-400"
                >
                  {{ m }}
                </span>
              </label>
            </div>
            <!-- Legend (visible when diff or review is on) -->
            <div
              v-if="showDiff || showReview"
              class="hidden sm:flex items-center gap-3 text-xs text-gray-500 dark:text-gray-400"
              data-testid="diff-legend"
            >
              <span v-if="showDiff" class="flex items-center gap-1">
                <span
                  class="inline-block w-3 h-3 rounded bg-red-100 dark:bg-red-900/40 border border-red-200 dark:border-red-800/40"
                />
                removed
              </span>
              <span v-if="showDiff" class="flex items-center gap-1">
                <span
                  class="inline-block w-3 h-3 rounded bg-emerald-100 dark:bg-emerald-900/40 border border-emerald-200 dark:border-emerald-800/40"
                />
                added
              </span>
              <span
                v-if="showReview"
                class="flex items-center gap-1"
                data-testid="review-legend"
              >
                <span
                  class="inline-block w-3 h-3 rounded bg-yellow-200 dark:bg-yellow-400/40 border border-yellow-300 dark:border-yellow-500/40"
                />
                uncertain
              </span>
            </div>
          </div>
          <div class="flex items-center gap-2">
            <button
              class="btn bg-white dark:bg-gray-800 border-red-200 dark:border-red-800/60 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 disabled:opacity-50 disabled:cursor-not-allowed"
              :disabled="saving || deleting"
              data-testid="delete-button"
              @click="confirmDelete"
            >
              <svg class="w-4 h-4 fill-current mr-1" viewBox="0 0 16 16">
                <path
                  d="M5 3V2a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v1h3a1 1 0 1 1 0 2h-.117l-.72 9.36A2 2 0 0 1 11.17 16H4.83a2 2 0 0 1-1.993-1.64L2.117 5H2a1 1 0 0 1 0-2h3Zm2 0h2V3H7Zm-2.88 2 .71 9.25a.01.01 0 0 0 .01.01h6.32a.01.01 0 0 0 .01-.01L11.88 5H4.12Z"
                />
              </svg>
              {{ deleting ? 'Deleting…' : 'Delete' }}
            </button>
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

        <!-- Review info banner — shown when Review is toggled on but no uncertain spans exist -->
        <div
          v-if="showReview && !hasUncertainSpans"
          class="mb-4 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800/40 rounded-lg px-4 py-3 text-sm"
          data-testid="review-no-spans-banner"
        >
          No uncertain words or phrases were detected in this entry. The OCR
          model was confident about every word on this page.
        </div>

        <!-- Side-by-side editor panels (static 50/50) -->
        <div
          ref="textPanelsRef"
          class="flex flex-col lg:flex-row gap-4 lg:min-h-[500px]"
        >
          <section
            class="flex-1 min-h-[300px] lg:min-h-0 flex flex-col bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700/60 rounded-xl shadow-xs p-4"
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
            class="flex-1 min-h-[300px] lg:min-h-0 flex flex-col bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700/60 rounded-xl shadow-xs p-4"
          >
            <h2
              class="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-3"
            >
              Corrected Text
            </h2>
            <!--
            Two presentation modes:

            1. Overlay OFF — mirror-div editor: a styled backdrop
               renders the diff-highlighted HTML underneath a
               transparent textarea. The textarea catches all
               keyboard/mouse input; the backdrop is kept scrolled in
               lockstep so highlights line up with glyphs.

            2. Overlay ON — read-only chunk/token overlay: the backdrop
               renders `overlayHtml` against `persistedText` (the
               server's final_text). The textarea is hidden; the user
               cannot edit while the overlay is active, so chunk/token
               offsets cannot drift from the rendered text.
          -->
            <div
              class="corrected-wrapper relative flex-1 rounded-md border border-gray-200 dark:border-gray-700/60 bg-white dark:bg-gray-900/40 overflow-hidden"
            >
              <template v-if="overlayMode === 'off'">
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
                  class="diff-surface absolute inset-0 w-full h-full border-0 bg-transparent text-transparent caret-gray-900 dark:caret-white resize-none focus:outline-none focus:ring-2 focus:ring-violet-500/40 rounded-md px-3 py-2"
                  data-testid="corrected-textarea"
                  @scroll="syncCorrectedScroll"
                  @input="syncCorrectedScroll"
                />
              </template>
              <template v-else>
                <!-- eslint-disable vue/no-v-html -->
                <div
                  class="diff-surface absolute inset-0 overflow-auto px-3 py-2 text-gray-900 dark:text-gray-100"
                  data-testid="overlay-display"
                  v-html="overlayHtml"
                />
                <!-- eslint-enable vue/no-v-html -->
                <div
                  v-if="overlayLoading"
                  class="absolute top-2 right-2 text-xs px-2 py-1 rounded bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-300"
                  data-testid="overlay-loading"
                >
                  Loading…
                </div>
              </template>
            </div>
          </section>
        </div>
      </template>
      <!-- end edit mode -->
    </template>

    <!-- Fallback: nothing matched. Show a loading indicator rather
         than a blank main area. See the comment above the
         `template v-else-if="store.currentEntry"` branch. -->
    <div
      v-else
      class="py-16 text-center text-gray-500 dark:text-gray-400"
      data-testid="loading-state"
    >
      Loading entry…
    </div>
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

/*
  Reading mode: comfortable serif typography for pleasant reading.
  Uses the same font family as diff-surface but with slightly larger
  size and generous line-height.
*/
.reading-surface {
  font-family: ui-serif, Georgia, Cambria, 'Times New Roman', serif;
  font-size: 1.0625rem;
  line-height: 1.8;
  letter-spacing: normal;
  white-space: pre-wrap;
  word-wrap: break-word;
  overflow-wrap: break-word;
}
</style>
