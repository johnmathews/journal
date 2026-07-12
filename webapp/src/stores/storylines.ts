import { computed, ref, watch } from 'vue'
import { defineStore } from 'pinia'
import type {
  ChapterDetail,
  CreateStorylineRequest,
  CreateStorylineResponse,
  SetStorylineAnchorsResponse,
  StorylineDetail,
  StorylineListParams,
  StorylineSummary,
} from '@/types/storyline'
import {
  createStoryline as createStorylineApi,
  deleteStoryline as deleteStorylineApi,
  fetchChapter,
  fetchStoryline,
  fetchStorylines,
  markChapterRead as markChapterReadApi,
  markChapterUnread as markChapterUnreadApi,
  refreshStoryline as refreshStorylineApi,
  renameChapter as renameChapterApi,
  setStorylineAnchors as setStorylineAnchorsApi,
  unpublishNewest as unpublishNewestApi,
  updateStoryline as updateStorylineApi,
} from '@/api/storylines'
import { useJobsStore } from '@/stores/jobs'
import { isTerminal } from '@/types/job'

export const useStorylinesStore = defineStore('storylines', () => {
  const storylines = ref<StorylineSummary[]>([])
  const currentStoryline = ref<StorylineDetail | null>(null)
  /** Chapter details for the current storyline, keyed by chapter id.
   *  Published chapters are immutable so cache hits are always valid;
   *  the cache is cleared when the storyline changes or an update job
   *  completes (the draft — and possibly addenda — changed). */
  const chapterCache = ref<Map<number, ChapterDetail>>(new Map())
  const total = ref(0)
  // List + detail loading split (mirrors entities.ts) so a slow detail
  // fetch doesn't blank the list spinner if we ever render both in the
  // same view.
  const loading = ref(false)
  const detailLoading = ref(false)
  const chapterLoading = ref(false)
  /** True while a storyline_update job (bootstrap / refresh / unpublish)
   *  is in flight for the current storyline. One flag — the server
   *  serializes storyline work anyway. */
  const updating = ref(false)
  const error = ref<string | null>(null)
  const creating = ref(false)
  const createError = ref<string | null>(null)
  const actionError = ref<string | null>(null)
  const savingAnchors = ref(false)
  const anchorsError = ref<string | null>(null)
  const savingName = ref(false)
  const nameError = ref<string | null>(null)
  const currentParams = ref<StorylineListParams>({
    limit: 20,
    offset: 0,
  })

  const totalPages = computed(() =>
    Math.ceil(total.value / (currentParams.value.limit || 20)),
  )
  const currentPage = computed(
    () =>
      Math.floor(
        (currentParams.value.offset || 0) / (currentParams.value.limit || 20),
      ) + 1,
  )
  const hasStorylines = computed(() => storylines.value.length > 0)
  /** Sum of unread chapters across all loaded storylines — sidebar badge. */
  const totalUnread = computed(() =>
    storylines.value.reduce((sum, s) => sum + (s.unread_count || 0), 0),
  )

  async function loadStorylines(
    params: StorylineListParams = {},
  ): Promise<void> {
    loading.value = true
    error.value = null
    try {
      const merged = { ...currentParams.value, ...params }
      currentParams.value = merged
      const resp = await fetchStorylines(merged)
      storylines.value = resp.items
      total.value = resp.total
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'Failed to load storylines'
    } finally {
      loading.value = false
    }
  }

  async function loadStoryline(id: number): Promise<void> {
    detailLoading.value = true
    error.value = null
    if (currentStoryline.value?.id !== id) {
      chapterCache.value = new Map()
    }
    try {
      currentStoryline.value = await fetchStoryline(id)
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'Failed to load storyline'
    } finally {
      detailLoading.value = false
    }
  }

  /** Load one chapter's full content, memoized per storyline. */
  async function loadChapter(
    storylineId: number,
    chapterId: number,
  ): Promise<ChapterDetail | null> {
    const cached = chapterCache.value.get(chapterId)
    if (cached) return cached
    chapterLoading.value = true
    error.value = null
    try {
      const detail = await fetchChapter(storylineId, chapterId)
      const next = new Map(chapterCache.value)
      next.set(chapterId, detail)
      chapterCache.value = next
      return detail
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'Failed to load chapter'
      return null
    } finally {
      chapterLoading.value = false
    }
  }

  function clearCurrent(): void {
    currentStoryline.value = null
    chapterCache.value = new Map()
    chapterLoading.value = false
    updating.value = false
  }

  /** Track one storyline_update job; while it runs `updating` is true,
   *  and on terminal status the storyline (and its chapters) reload. */
  function _trackUpdateJob(storylineId: number, jobId: string): void {
    const jobsStore = useJobsStore()
    updating.value = true
    jobsStore.trackJob(jobId, 'storyline_update')
    // Use a wrapper ref to avoid TDZ: `immediate: true` can fire the
    // callback before `watch()` returns, so we must not reference the
    // return value of `watch()` directly inside the callback.
    const stopRef = { fn: (): void => {} }
    stopRef.fn = watch(
      () => jobsStore.getJobById(jobId)?.status,
      (status) => {
        if (status != null && isTerminal(status)) {
          updating.value = false
          stopRef.fn()
          chapterCache.value = new Map()
          void loadStoryline(storylineId)
          void loadStorylines(currentParams.value)
        }
      },
      { immediate: true },
    )
  }

  async function createStoryline(
    request: CreateStorylineRequest,
  ): Promise<CreateStorylineResponse> {
    creating.value = true
    createError.value = null
    try {
      const resp = await createStorylineApi(request)
      if (resp.bootstrap_job_id) {
        _trackUpdateJob(resp.storyline.id, resp.bootstrap_job_id)
      }
      return resp
    } catch (e) {
      createError.value =
        e instanceof Error ? e.message : 'Failed to create storyline'
      throw e
    } finally {
      creating.value = false
    }
  }

  /** Re-narrate the draft chapter (202 + job, tracked). */
  async function refresh(id: number): Promise<void> {
    actionError.value = null
    try {
      const resp = await refreshStorylineApi(id)
      _trackUpdateJob(id, resp.job_id)
    } catch (e) {
      actionError.value =
        e instanceof Error ? e.message : 'Failed to queue refresh'
      throw e
    }
  }

  /** Fold the newest published chapter back into the draft (202 + job). */
  async function unpublishNewest(id: number): Promise<void> {
    actionError.value = null
    try {
      const resp = await unpublishNewestApi(id)
      _trackUpdateJob(id, resp.job_id)
    } catch (e) {
      actionError.value =
        e instanceof Error ? e.message : 'Failed to queue unpublish'
      throw e
    }
  }

  /** Flip a chapter's read state locally (detail + list + cache). */
  function _applyReadState(
    storylineId: number,
    chapterId: number,
    readAt: string | null,
  ): void {
    const detail = currentStoryline.value
    if (detail?.id === storylineId) {
      const ch = detail.chapters.find((c) => c.id === chapterId)
      if (ch && ch.read_at !== readAt) {
        const delta = readAt === null ? 1 : -1
        ch.read_at = readAt
        detail.unread_count = Math.max(0, detail.unread_count + delta)
        const row = storylines.value.find((s) => s.id === storylineId)
        if (row) row.unread_count = Math.max(0, row.unread_count + delta)
      }
    }
    const cached = chapterCache.value.get(chapterId)
    if (cached) cached.read_at = readAt
  }

  /** Mark a published chapter read. Optimistic: the badge clears
   *  immediately and rolls back if the API call fails. */
  async function markRead(
    storylineId: number,
    chapterId: number,
  ): Promise<void> {
    const previous =
      currentStoryline.value?.chapters.find((c) => c.id === chapterId)
        ?.read_at ?? null
    if (previous !== null) return // already read
    _applyReadState(storylineId, chapterId, new Date().toISOString())
    try {
      const meta = await markChapterReadApi(storylineId, chapterId)
      _applyReadState(storylineId, chapterId, meta.read_at)
    } catch (e) {
      _applyReadState(storylineId, chapterId, null)
      actionError.value =
        e instanceof Error ? e.message : 'Failed to mark chapter read'
    }
  }

  /** Mark a published chapter unread (menu action; non-optimistic). */
  async function markUnread(
    storylineId: number,
    chapterId: number,
  ): Promise<void> {
    actionError.value = null
    try {
      const meta = await markChapterUnreadApi(storylineId, chapterId)
      _applyReadState(storylineId, chapterId, meta.read_at)
    } catch (e) {
      actionError.value =
        e instanceof Error ? e.message : 'Failed to mark chapter unread'
      throw e
    }
  }

  /** Rename a chapter. The server trims the title and returns the
   *  authoritative meta, refreshed onto the detail + cache. */
  async function renameChapter(
    storylineId: number,
    chapterId: number,
    title: string,
  ): Promise<void> {
    const resp = await renameChapterApi(storylineId, chapterId, { title })
    if (currentStoryline.value?.id === storylineId) {
      const ch = currentStoryline.value.chapters.find((c) => c.id === chapterId)
      if (ch) ch.title = resp.title
    }
    const cached = chapterCache.value.get(chapterId)
    if (cached) cached.title = resp.title
  }

  /** Replace the anchor set on a storyline (PUT /anchors).
   *
   * The server response is authoritative — it dedupes and sorts the
   * ids ascending — so on success we refresh `currentStoryline` and
   * any matching list row from the response rather than echoing the
   * caller's selection. The PUT does not regenerate the draft;
   * callers that want a fresh narrative chain `refresh()` afterwards. */
  async function setAnchors(
    id: number,
    entityIds: number[],
  ): Promise<SetStorylineAnchorsResponse> {
    savingAnchors.value = true
    anchorsError.value = null
    try {
      const resp = await setStorylineAnchorsApi(id, { entity_ids: entityIds })
      if (currentStoryline.value?.id === id) {
        currentStoryline.value = {
          ...currentStoryline.value,
          anchors: resp.anchors,
        }
      }
      const row = storylines.value.find((s) => s.id === id)
      if (row) {
        row.anchors = resp.anchors
      }
      return resp
    } catch (e) {
      anchorsError.value =
        e instanceof Error ? e.message : 'Failed to update anchors'
      throw e
    } finally {
      savingAnchors.value = false
    }
  }

  /** Rename a storyline (PATCH /api/storylines/{id}). */
  async function renameStoryline(id: number, name: string): Promise<void> {
    savingName.value = true
    nameError.value = null
    try {
      const resp = await updateStorylineApi(id, { name })
      if (currentStoryline.value?.id === id) {
        currentStoryline.value = {
          ...currentStoryline.value,
          name: resp.name,
        }
      }
      const row = storylines.value.find((s) => s.id === id)
      if (row) {
        row.name = resp.name
      }
    } catch (e) {
      nameError.value =
        e instanceof Error ? e.message : 'Failed to rename storyline'
      throw e
    } finally {
      savingName.value = false
    }
  }

  async function removeStoryline(id: number): Promise<void> {
    error.value = null
    try {
      await deleteStorylineApi(id)
      storylines.value = storylines.value.filter((s) => s.id !== id)
      total.value = Math.max(0, total.value - 1)
      if (currentStoryline.value?.id === id) {
        clearCurrent()
      }
    } catch (e) {
      error.value =
        e instanceof Error ? e.message : 'Failed to delete storyline'
      throw e
    }
  }

  return {
    storylines,
    currentStoryline,
    chapterCache,
    total,
    loading,
    detailLoading,
    chapterLoading,
    updating,
    error,
    creating,
    createError,
    actionError,
    savingAnchors,
    anchorsError,
    savingName,
    nameError,
    currentParams,
    totalPages,
    currentPage,
    hasStorylines,
    totalUnread,
    loadStorylines,
    loadStoryline,
    loadChapter,
    clearCurrent,
    createStoryline,
    refresh,
    unpublishNewest,
    markRead,
    markUnread,
    renameChapter,
    setAnchors,
    renameStoryline,
    removeStoryline,
  }
})
