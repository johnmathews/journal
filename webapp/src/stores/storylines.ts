import { computed, ref, watch } from 'vue'
import { defineStore } from 'pinia'
import type {
  AddChapterRequest,
  ChapterMutationResponse,
  ChapterMultiMutationResponse,
  CreateStorylineRequest,
  CreateStorylineResponse,
  RegenerateStorylineRequest,
  RegenerateStorylineResponse,
  SetStorylineAnchorsResponse,
  StorylineChapterDetail,
  StorylineDetail,
  StorylineListParams,
  StorylineSummary,
  UpdateChapterWindowRequest,
} from '@/types/storyline'
import {
  addChapter as addChapterApi,
  createStoryline as createStorylineApi,
  deleteChapter as deleteChapterApi,
  deleteStoryline as deleteStorylineApi,
  fetchStoryline,
  fetchStorylineChapter,
  fetchStorylines,
  mergeChapters as mergeChaptersApi,
  regenerateStoryline as regenerateStorylineApi,
  regenerateStorylineChapter as regenerateStorylineChapterApi,
  renameStorylineChapter as renameStorylineChapterApi,
  setStorylineAnchors as setStorylineAnchorsApi,
  splitChapter as splitChapterApi,
  updateChapterWindow as updateChapterWindowApi,
  updateStoryline as updateStorylineApi,
} from '@/api/storylines'
import { useJobsStore } from '@/stores/jobs'
import { isTerminal } from '@/types/job'

export const useStorylinesStore = defineStore('storylines', () => {
  const storylines = ref<StorylineSummary[]>([])
  const currentStoryline = ref<StorylineDetail | null>(null)
  const currentChapter = ref<StorylineChapterDetail | null>(null)
  const chapterLoading = ref(false)
  const total = ref(0)
  // List + detail loading split (mirrors entities.ts) so a slow detail
  // fetch doesn't blank the list spinner if we ever render both in the
  // same view.
  const loading = ref(false)
  const detailLoading = ref(false)
  const error = ref<string | null>(null)
  const creating = ref(false)
  const createError = ref<string | null>(null)
  const regenerating = ref(false)
  const regenerateError = ref<string | null>(null)
  const savingAnchors = ref(false)
  const anchorsError = ref<string | null>(null)
  const savingName = ref(false)
  const nameError = ref<string | null>(null)
  const currentParams = ref<StorylineListParams>({
    limit: 20,
    offset: 0,
  })

  /** Chapter ids that have queued regeneration jobs currently in-flight.
   *  Templates can call `.has(ch.id)` to show a "generating…" indicator. */
  const generatingChapterIds = ref<Set<number>>(new Set())

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
    try {
      currentStoryline.value = await fetchStoryline(id)
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'Failed to load storyline'
    } finally {
      detailLoading.value = false
    }
  }

  function clearCurrent(): void {
    currentStoryline.value = null
    currentChapter.value = null
    chapterLoading.value = false
  }

  async function createStoryline(
    request: CreateStorylineRequest,
  ): Promise<CreateStorylineResponse> {
    creating.value = true
    createError.value = null
    try {
      return await createStorylineApi(request)
    } catch (e) {
      createError.value =
        e instanceof Error ? e.message : 'Failed to create storyline'
      throw e
    } finally {
      creating.value = false
    }
  }

  async function regenerate(
    id: number,
    body?: RegenerateStorylineRequest,
  ): Promise<RegenerateStorylineResponse> {
    regenerating.value = true
    regenerateError.value = null
    try {
      return await regenerateStorylineApi(id, body)
    } catch (e) {
      regenerateError.value =
        e instanceof Error ? e.message : 'Failed to queue regeneration'
      throw e
    } finally {
      regenerating.value = false
    }
  }

  /** Replace the anchor set on a storyline (PUT /anchors).
   *
   * The server response is authoritative — it dedupes and sorts the
   * ids ascending — so on success we refresh `currentStoryline` and
   * any matching list row from the response rather than echoing the
   * caller's selection. The PUT does not regenerate panels server-side;
   * callers that want fresh panels chain `regenerate()` afterwards. */
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

  /** Rename a storyline (PATCH /api/storylines/{id}).
   *
   * The server trims the name and returns the authoritative value, so
   * on success we refresh `currentStoryline.name` and any matching list
   * row from the response. A rename does not touch panels, so callers
   * never need to chain a regeneration. */
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

  /** Load a single chapter's detail (panels + summary fields) into
   *  `currentChapter`. Uses a dedicated `chapterLoading` flag so the
   *  per-chapter reader can show its own spinner without disturbing the
   *  storyline detail load. Errors land in the shared `error` ref. */
  async function loadChapter(
    storylineId: number,
    chapterId: number,
  ): Promise<void> {
    chapterLoading.value = true
    error.value = null
    try {
      currentChapter.value = await fetchStorylineChapter(storylineId, chapterId)
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'Failed to load chapter'
    } finally {
      chapterLoading.value = false
    }
  }

  /** Queue a regeneration of a single chapter's panels. Mirrors
   *  `regenerate()` — reuses the shared `regenerating`/`regenerateError`
   *  flags and returns the job response so callers can poll. */
  async function regenerateChapter(
    storylineId: number,
    chapterId: number,
  ): Promise<RegenerateStorylineResponse> {
    regenerating.value = true
    regenerateError.value = null
    try {
      return await regenerateStorylineChapterApi(storylineId, chapterId)
    } catch (e) {
      regenerateError.value =
        e instanceof Error ? e.message : 'Failed to queue regeneration'
      throw e
    } finally {
      regenerating.value = false
    }
  }

  /** Rename a chapter (PATCH /chapters/{cid}). The server trims the
   *  title and returns the authoritative summary, so on success we
   *  refresh the matching chapter summary on `currentStoryline.chapters`
   *  and the loaded `currentChapter` title from the response. */
  async function renameChapter(
    storylineId: number,
    chapterId: number,
    title: string,
  ): Promise<void> {
    const resp = await renameStorylineChapterApi(storylineId, chapterId, {
      title,
    })
    if (currentStoryline.value?.id === storylineId) {
      const ch = currentStoryline.value.chapters.find((c) => c.id === chapterId)
      if (ch) ch.title = resp.title
    }
    if (currentChapter.value?.id === chapterId) {
      currentChapter.value = { ...currentChapter.value, title: resp.title }
    }
  }

  /** Register per-chapter regeneration jobs and remove ids from the
   *  generating set when all jobs reach a terminal status.
   *
   *  When `chapterIds` is non-empty, each id is added to
   *  `generatingChapterIds` immediately so the UI can show a badge.
   *  When all jobs are terminal (or there were none to begin with and
   *  `chapterIds` was also empty), the ids are cleared and the storyline
   *  is reloaded to pick up fresh panels.
   *
   *  If `jobIds` is empty but `chapterIds` is non-empty, the ids are
   *  cleared right away (no async work to wait for). */
  function _trackChapterRegens(
    storylineId: number,
    chapterIds: number[],
    jobIds: string[],
  ): void {
    const jobsStore = useJobsStore()
    chapterIds.forEach((id) => {
      generatingChapterIds.value = new Set(generatingChapterIds.value)
      generatingChapterIds.value.add(id)
    })
    jobIds.forEach((id) => jobsStore.trackJob(id, 'storyline_generation'))
    if (jobIds.length === 0) {
      if (chapterIds.length > 0) {
        const next = new Set(generatingChapterIds.value)
        chapterIds.forEach((id) => next.delete(id))
        generatingChapterIds.value = next
      }
      return
    }
    // Use a wrapper ref to avoid TDZ: `immediate: true` can fire the
    // callback before `watch()` returns, so we must not reference the
    // return value of `watch()` directly inside the callback.
    const stopRef = { fn: (): void => {} }
    stopRef.fn = watch(
      () => jobIds.map((id) => jobsStore.getJobById(id)?.status),
      (statuses) => {
        if (statuses.every((s) => s != null && isTerminal(s))) {
          const next = new Set(generatingChapterIds.value)
          chapterIds.forEach((id) => next.delete(id))
          generatingChapterIds.value = next
          stopRef.fn()
          void loadStoryline(storylineId)
        }
      },
      { immediate: true },
    )
  }

  async function addChapter(
    storylineId: number,
    request: AddChapterRequest,
  ): Promise<ChapterMutationResponse> {
    const resp = await addChapterApi(storylineId, request)
    await loadStoryline(storylineId)
    _trackChapterRegens(storylineId, [resp.chapter.id], resp.job_ids)
    return resp
  }

  async function splitChapter(
    storylineId: number,
    chapterId: number,
    date: string,
  ): Promise<ChapterMultiMutationResponse> {
    const resp = await splitChapterApi(storylineId, chapterId, { date })
    await loadStoryline(storylineId)
    _trackChapterRegens(
      storylineId,
      resp.chapters.map((c) => c.id),
      resp.job_ids,
    )
    return resp
  }

  async function mergeChapters(
    storylineId: number,
    chapterIds: number[],
  ): Promise<ChapterMutationResponse> {
    const resp = await mergeChaptersApi(storylineId, {
      chapter_ids: chapterIds,
    })
    await loadStoryline(storylineId)
    _trackChapterRegens(storylineId, [resp.chapter.id], resp.job_ids)
    return resp
  }

  async function updateChapterDates(
    storylineId: number,
    chapterId: number,
    request: UpdateChapterWindowRequest,
  ): Promise<ChapterMultiMutationResponse> {
    const resp = await updateChapterWindowApi(storylineId, chapterId, request)
    await loadStoryline(storylineId)
    _trackChapterRegens(
      storylineId,
      resp.chapters.map((c) => c.id),
      resp.job_ids,
    )
    return resp
  }

  async function deleteChapter(
    storylineId: number,
    chapterId: number,
    allowGap = false,
  ): Promise<void> {
    const resp = await deleteChapterApi(storylineId, chapterId, {
      allow_gap: allowGap,
    })
    await loadStoryline(storylineId)
    // No chapter objects returned — skip per-chapter marking, but still
    // set up the watcher to reload when jobs complete (empty chapterIds
    // skips the marking but the watcher fires as usual).
    _trackChapterRegens(storylineId, [], resp.job_ids)
  }

  async function removeStoryline(id: number): Promise<void> {
    error.value = null
    try {
      await deleteStorylineApi(id)
      storylines.value = storylines.value.filter((s) => s.id !== id)
      total.value = Math.max(0, total.value - 1)
      if (currentStoryline.value?.id === id) {
        currentStoryline.value = null
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
    currentChapter,
    chapterLoading,
    total,
    loading,
    detailLoading,
    error,
    creating,
    createError,
    regenerating,
    regenerateError,
    savingAnchors,
    anchorsError,
    savingName,
    nameError,
    currentParams,
    generatingChapterIds,
    totalPages,
    currentPage,
    hasStorylines,
    loadStorylines,
    loadStoryline,
    loadChapter,
    regenerateChapter,
    renameChapter,
    clearCurrent,
    createStoryline,
    regenerate,
    setAnchors,
    renameStoryline,
    removeStoryline,
    addChapter,
    splitChapter,
    mergeChapters,
    updateChapterDates,
    deleteChapter,
  }
})
