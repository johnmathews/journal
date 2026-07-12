import { describe, it, expect, vi, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { nextTick, ref } from 'vue'
import { useStorylinesStore } from '../storylines'
import type { ChapterMeta, StorylineDetail } from '@/types/storyline'

vi.mock('@/api/storylines', () => ({
  fetchStorylines: vi.fn(),
  fetchStoryline: vi.fn(),
  fetchChapter: vi.fn(),
  createStoryline: vi.fn(),
  deleteStoryline: vi.fn(),
  setStorylineAnchors: vi.fn(),
  updateStoryline: vi.fn(),
  refreshStoryline: vi.fn(),
  unpublishNewest: vi.fn(),
  markChapterRead: vi.fn(),
  markChapterUnread: vi.fn(),
  renameChapter: vi.fn(),
}))

// Reactive fake jobs store: tests drive job status transitions through
// `jobStatuses` and the store's watcher reacts as it would in prod.
const jobStatuses = ref<Map<string, string>>(new Map())
const mockTrackJob = vi.fn()
vi.mock('@/stores/jobs', () => ({
  useJobsStore: () => ({
    trackJob: mockTrackJob,
    getJobById: (id: string) => {
      const status = jobStatuses.value.get(id)
      return status ? { id, status } : undefined
    },
  }),
}))

import {
  createStoryline,
  fetchChapter,
  fetchStoryline,
  fetchStorylines,
  markChapterRead,
  markChapterUnread,
  refreshStoryline,
  renameChapter,
  unpublishNewest,
} from '@/api/storylines'

const mockFetchStorylines = vi.mocked(fetchStorylines)
const mockFetchStoryline = vi.mocked(fetchStoryline)
const mockFetchChapter = vi.mocked(fetchChapter)
const mockCreateStoryline = vi.mocked(createStoryline)
const mockRefreshStoryline = vi.mocked(refreshStoryline)
const mockUnpublishNewest = vi.mocked(unpublishNewest)
const mockMarkChapterRead = vi.mocked(markChapterRead)
const mockMarkChapterUnread = vi.mocked(markChapterUnread)
const mockRenameChapter = vi.mocked(renameChapter)

function chapterMeta(overrides: Partial<ChapterMeta> = {}): ChapterMeta {
  return {
    id: 3,
    seq: 1,
    title: 'Ch1',
    state: 'published',
    entry_count: 4,
    first_entry_date: '2026-01-01',
    last_entry_date: '2026-02-01',
    published_at: '2026-02-02T00:00:00Z',
    read_at: null,
    citation_count: 5,
    ...overrides,
  }
}

function summary(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 1,
    anchors: [{ entity_id: 100, canonical_name: 'Running' }],
    name: 'Running',
    description: '',
    status: 'active' as const,
    unread_count: 0,
    chapter_count: 1,
    created_at: '2026-05-10T00:00:00Z',
    updated_at: '2026-05-12T10:00:00Z',
    ...overrides,
  }
}

function detail(
  overrides: Partial<Record<string, unknown>> = {},
): StorylineDetail {
  return {
    ...summary(),
    chapters: [
      chapterMeta({ id: 3, seq: 1 }),
      chapterMeta({
        id: 4,
        seq: 2,
        state: 'draft',
        published_at: null,
        read_at: null,
      }),
    ],
    ...overrides,
  } as StorylineDetail
}

describe('useStorylinesStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    jobStatuses.value = new Map()
  })

  it('loadStorylines populates state and totalUnread', async () => {
    mockFetchStorylines.mockResolvedValue({
      items: [
        summary({ id: 1, unread_count: 2 }),
        summary({ id: 2, name: 'Atlas', unread_count: 1 }),
      ],
      total: 2,
      limit: 20,
      offset: 0,
    })
    const store = useStorylinesStore()
    await store.loadStorylines()
    expect(store.storylines).toHaveLength(2)
    expect(store.totalUnread).toBe(3)
  })

  it('loadChapter caches by id and skips the second fetch', async () => {
    mockFetchChapter.mockResolvedValue({
      ...chapterMeta({ id: 3 }),
      segments: [{ kind: 'text', text: 'prose' }],
      addenda: [],
      model_used: 'm',
      generated_at: null,
    })
    const store = useStorylinesStore()
    const first = await store.loadChapter(1, 3)
    const second = await store.loadChapter(1, 3)
    expect(mockFetchChapter).toHaveBeenCalledTimes(1)
    expect(second).toStrictEqual(first)
  })

  it('loadStoryline for a different id clears the chapter cache', async () => {
    mockFetchChapter.mockResolvedValue({
      ...chapterMeta({ id: 3 }),
      segments: [],
      addenda: [],
      model_used: 'm',
      generated_at: null,
    })
    mockFetchStoryline.mockResolvedValue(detail({ id: 2 }))
    const store = useStorylinesStore()
    await store.loadChapter(1, 3)
    await store.loadStoryline(2)
    await store.loadChapter(2, 3)
    expect(mockFetchChapter).toHaveBeenCalledTimes(2)
  })

  it('markRead is optimistic and decrements unread counts', async () => {
    mockFetchStoryline.mockResolvedValue(detail({ id: 1, unread_count: 1 }))
    mockFetchStorylines.mockResolvedValue({
      items: [summary({ id: 1, unread_count: 1 })],
      total: 1,
      limit: 20,
      offset: 0,
    })
    let resolveApi: (v: ChapterMeta) => void = () => {}
    mockMarkChapterRead.mockReturnValue(
      new Promise((resolve) => {
        resolveApi = resolve
      }),
    )
    const store = useStorylinesStore()
    await store.loadStorylines()
    await store.loadStoryline(1)

    const pending = store.markRead(1, 3)
    // Optimistic: applied before the API resolves.
    expect(store.currentStoryline?.chapters[0].read_at).not.toBeNull()
    expect(store.currentStoryline?.unread_count).toBe(0)
    expect(store.storylines[0].unread_count).toBe(0)

    resolveApi(chapterMeta({ id: 3, read_at: '2026-07-12T09:00:00Z' }))
    await pending
    expect(store.currentStoryline?.chapters[0].read_at).toBe(
      '2026-07-12T09:00:00Z',
    )
  })

  it('markRead rolls back on API failure', async () => {
    mockFetchStoryline.mockResolvedValue(detail({ id: 1, unread_count: 1 }))
    mockMarkChapterRead.mockRejectedValue(new Error('boom'))
    const store = useStorylinesStore()
    await store.loadStoryline(1)
    await store.markRead(1, 3)
    expect(store.currentStoryline?.chapters[0].read_at).toBeNull()
    expect(store.currentStoryline?.unread_count).toBe(1)
    expect(store.actionError).toBe('boom')
  })

  it('markRead is a no-op for an already-read chapter', async () => {
    mockFetchStoryline.mockResolvedValue(
      detail({
        id: 1,
        chapters: [chapterMeta({ id: 3, read_at: '2026-07-01T00:00:00Z' })],
      }),
    )
    const store = useStorylinesStore()
    await store.loadStoryline(1)
    await store.markRead(1, 3)
    expect(mockMarkChapterRead).not.toHaveBeenCalled()
  })

  it('markUnread applies the server state', async () => {
    mockFetchStoryline.mockResolvedValue(
      detail({
        id: 1,
        unread_count: 0,
        chapters: [chapterMeta({ id: 3, read_at: '2026-07-01T00:00:00Z' })],
      }),
    )
    mockMarkChapterUnread.mockResolvedValue(
      chapterMeta({ id: 3, read_at: null }),
    )
    const store = useStorylinesStore()
    await store.loadStoryline(1)
    await store.markUnread(1, 3)
    expect(store.currentStoryline?.chapters[0].read_at).toBeNull()
    expect(store.currentStoryline?.unread_count).toBe(1)
  })

  it('refresh tracks the job: updating until terminal, then reloads', async () => {
    mockRefreshStoryline.mockResolvedValue({ job_id: 'j1', status: 'queued' })
    mockFetchStoryline.mockResolvedValue(detail({ id: 1 }))
    mockFetchStorylines.mockResolvedValue({
      items: [summary({ id: 1 })],
      total: 1,
      limit: 20,
      offset: 0,
    })
    jobStatuses.value = new Map([['j1', 'running']])
    const store = useStorylinesStore()
    await store.loadStoryline(1) // refresh is triggered from the detail view
    mockFetchStoryline.mockClear()
    await store.refresh(1)
    expect(store.updating).toBe(true)
    expect(mockTrackJob).toHaveBeenCalledWith('j1', 'storyline_update')

    jobStatuses.value = new Map([['j1', 'succeeded']])
    await nextTick()
    expect(store.updating).toBe(false)
    expect(mockFetchStoryline).toHaveBeenCalledWith(1)
  })

  it('unpublishNewest queues and tracks the job', async () => {
    mockUnpublishNewest.mockResolvedValue({ job_id: 'j2', status: 'queued' })
    jobStatuses.value = new Map([['j2', 'running']])
    const store = useStorylinesStore()
    await store.unpublishNewest(1)
    expect(mockUnpublishNewest).toHaveBeenCalledWith(1)
    expect(store.updating).toBe(true)
  })

  it('createStoryline tracks the bootstrap job when present', async () => {
    mockCreateStoryline.mockResolvedValue({
      storyline: detail({ id: 5 }),
      bootstrap_job_id: 'j3',
    })
    jobStatuses.value = new Map([['j3', 'running']])
    const store = useStorylinesStore()
    await store.createStoryline({ entity_ids: [1], name: 'X' })
    expect(mockTrackJob).toHaveBeenCalledWith('j3', 'storyline_update')
    expect(store.updating).toBe(true)
  })

  it('createStoryline tolerates a null bootstrap_job_id', async () => {
    mockCreateStoryline.mockResolvedValue({
      storyline: detail({ id: 5 }),
      bootstrap_job_id: null,
    })
    const store = useStorylinesStore()
    await store.createStoryline({ entity_ids: [1], name: 'X' })
    expect(mockTrackJob).not.toHaveBeenCalled()
    expect(store.updating).toBe(false)
  })

  it('renameChapter updates detail and cache from the response', async () => {
    mockFetchStoryline.mockResolvedValue(detail({ id: 1 }))
    mockFetchChapter.mockResolvedValue({
      ...chapterMeta({ id: 3 }),
      segments: [],
      addenda: [],
      model_used: 'm',
      generated_at: null,
    })
    mockRenameChapter.mockResolvedValue(
      chapterMeta({ id: 3, title: 'Renamed' }),
    )
    const store = useStorylinesStore()
    await store.loadStoryline(1)
    await store.loadChapter(1, 3)
    await store.renameChapter(1, 3, 'Renamed')
    expect(store.currentStoryline?.chapters[0].title).toBe('Renamed')
    expect(store.chapterCache.get(3)?.title).toBe('Renamed')
  })
})

describe('useStorylinesStore — error and secondary paths', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    jobStatuses.value = new Map()
  })

  it('loadStorylines records an error message on failure', async () => {
    mockFetchStorylines.mockRejectedValue(new Error('list down'))
    const store = useStorylinesStore()
    await store.loadStorylines()
    expect(store.error).toBe('list down')
    expect(store.loading).toBe(false)
  })

  it('loadStoryline records an error message on failure', async () => {
    mockFetchStoryline.mockRejectedValue(new Error('detail down'))
    const store = useStorylinesStore()
    await store.loadStoryline(1)
    expect(store.error).toBe('detail down')
  })

  it('loadChapter records an error and returns null on failure', async () => {
    mockFetchChapter.mockRejectedValue(new Error('chapter down'))
    const store = useStorylinesStore()
    const result = await store.loadChapter(1, 3)
    expect(result).toBeNull()
    expect(store.error).toBe('chapter down')
  })

  it('refresh records actionError and rethrows on API failure', async () => {
    mockRefreshStoryline.mockRejectedValue(new Error('no engine'))
    const store = useStorylinesStore()
    await expect(store.refresh(1)).rejects.toThrow('no engine')
    expect(store.actionError).toBe('no engine')
    expect(store.updating).toBe(false)
  })

  it('unpublishNewest records actionError and rethrows on API failure', async () => {
    mockUnpublishNewest.mockRejectedValue(new Error('nothing published'))
    const store = useStorylinesStore()
    await expect(store.unpublishNewest(1)).rejects.toThrow('nothing published')
    expect(store.actionError).toBe('nothing published')
  })

  it('markUnread records actionError and rethrows on failure', async () => {
    mockFetchStoryline.mockResolvedValue(
      detail({
        id: 1,
        chapters: [chapterMeta({ id: 3, read_at: '2026-07-01T00:00:00Z' })],
      }),
    )
    mockMarkChapterUnread.mockRejectedValue(new Error('nope'))
    const store = useStorylinesStore()
    await store.loadStoryline(1)
    await expect(store.markUnread(1, 3)).rejects.toThrow('nope')
    expect(store.actionError).toBe('nope')
  })

  it('createStoryline records createError and rethrows on failure', async () => {
    mockCreateStoryline.mockRejectedValue(new Error('409'))
    const store = useStorylinesStore()
    await expect(
      store.createStoryline({ entity_ids: [1], name: 'X' }),
    ).rejects.toThrow('409')
    expect(store.createError).toBe('409')
    expect(store.creating).toBe(false)
  })

  it('setAnchors updates detail + list rows from the response', async () => {
    const { setStorylineAnchors } = await import('@/api/storylines')
    const mockSetAnchors = vi.mocked(setStorylineAnchors)
    mockFetchStoryline.mockResolvedValue(detail({ id: 1 }))
    mockFetchStorylines.mockResolvedValue({
      items: [summary({ id: 1 })],
      total: 1,
      limit: 20,
      offset: 0,
    })
    mockSetAnchors.mockResolvedValue({
      id: 1,
      anchors: [{ entity_id: 9, canonical_name: 'Atlas' }],
    })
    const store = useStorylinesStore()
    await store.loadStorylines()
    await store.loadStoryline(1)
    await store.setAnchors(1, [9])
    expect(store.currentStoryline?.anchors[0].entity_id).toBe(9)
    expect(store.storylines[0].anchors[0].entity_id).toBe(9)
  })

  it('setAnchors records anchorsError and rethrows on failure', async () => {
    const { setStorylineAnchors } = await import('@/api/storylines')
    vi.mocked(setStorylineAnchors).mockRejectedValue(new Error('422'))
    const store = useStorylinesStore()
    await expect(store.setAnchors(1, [9])).rejects.toThrow('422')
    expect(store.anchorsError).toBe('422')
  })

  it('renameStoryline updates detail + list and records errors', async () => {
    const { updateStoryline } = await import('@/api/storylines')
    const mockUpdate = vi.mocked(updateStoryline)
    mockFetchStoryline.mockResolvedValue(detail({ id: 1 }))
    mockFetchStorylines.mockResolvedValue({
      items: [summary({ id: 1 })],
      total: 1,
      limit: 20,
      offset: 0,
    })
    mockUpdate.mockResolvedValue(summary({ id: 1, name: 'Renamed' }) as never)
    const store = useStorylinesStore()
    await store.loadStorylines()
    await store.loadStoryline(1)
    await store.renameStoryline(1, 'Renamed')
    expect(store.currentStoryline?.name).toBe('Renamed')
    expect(store.storylines[0].name).toBe('Renamed')

    mockUpdate.mockRejectedValue(new Error('400'))
    await expect(store.renameStoryline(1, '')).rejects.toThrow('400')
    expect(store.nameError).toBe('400')
  })

  it('removeStoryline drops the row and clears current when it matches', async () => {
    const { deleteStoryline } = await import('@/api/storylines')
    vi.mocked(deleteStoryline).mockResolvedValue({ deleted: true })
    mockFetchStoryline.mockResolvedValue(detail({ id: 1 }))
    mockFetchStorylines.mockResolvedValue({
      items: [summary({ id: 1 })],
      total: 1,
      limit: 20,
      offset: 0,
    })
    const store = useStorylinesStore()
    await store.loadStorylines()
    await store.loadStoryline(1)
    await store.removeStoryline(1)
    expect(store.storylines).toHaveLength(0)
    expect(store.currentStoryline).toBeNull()
  })

  it('removeStoryline records an error and rethrows on failure', async () => {
    const { deleteStoryline } = await import('@/api/storylines')
    vi.mocked(deleteStoryline).mockRejectedValue(new Error('500'))
    const store = useStorylinesStore()
    await expect(store.removeStoryline(1)).rejects.toThrow('500')
    expect(store.error).toBe('500')
  })
})

describe('useStorylinesStore — fallback messages and cache branches', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    jobStatuses.value = new Map()
  })

  it('non-Error rejections fall back to generic messages', async () => {
    mockFetchStorylines.mockRejectedValue('string failure')
    mockRefreshStoryline.mockRejectedValue('string failure')
    const store = useStorylinesStore()
    await store.loadStorylines()
    expect(store.error).toBe('Failed to load storylines')
    await expect(store.refresh(1)).rejects.toBe('string failure')
    expect(store.actionError).toBe('Failed to queue refresh')
  })

  it('reloading the same storyline keeps the chapter cache warm', async () => {
    mockFetchStoryline.mockResolvedValue(detail({ id: 1 }))
    mockFetchChapter.mockResolvedValue({
      ...chapterMeta({ id: 3 }),
      segments: [],
      addenda: [],
      model_used: 'm',
      generated_at: null,
    })
    const store = useStorylinesStore()
    await store.loadStoryline(1)
    await store.loadChapter(1, 3)
    await store.loadStoryline(1) // same id — cache survives
    await store.loadChapter(1, 3)
    expect(mockFetchChapter).toHaveBeenCalledTimes(1)
  })

  it('markRead for a storyline other than the loaded one still calls the API', async () => {
    mockFetchStoryline.mockResolvedValue(detail({ id: 1 }))
    mockMarkChapterRead.mockResolvedValue(
      chapterMeta({ id: 99, read_at: '2026-07-12T00:00:00Z' }),
    )
    const store = useStorylinesStore()
    await store.loadStoryline(1)
    await store.markRead(2, 99) // not the loaded storyline
    expect(mockMarkChapterRead).toHaveBeenCalledWith(2, 99)
  })
})

describe('useStorylinesStore — final-review regression fixes', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    jobStatuses.value = new Map()
  })

  it('re-fetches chapter content after an update job completes', async () => {
    mockFetchStoryline.mockResolvedValue(detail({ id: 1 }))
    mockFetchStorylines.mockResolvedValue({
      items: [summary({ id: 1 })],
      total: 1,
      limit: 20,
      offset: 0,
    })
    mockFetchChapter.mockResolvedValue({
      ...chapterMeta({ id: 3 }),
      segments: [],
      addenda: [],
      model_used: 'm',
      generated_at: null,
    })
    mockRefreshStoryline.mockResolvedValue({ job_id: 'j1', status: 'queued' })
    jobStatuses.value = new Map([['j1', 'running']])
    const store = useStorylinesStore()
    await store.loadStoryline(1)
    await store.loadChapter(1, 3)
    mockFetchChapter.mockClear()

    await store.refresh(1)
    jobStatuses.value = new Map([['j1', 'succeeded']])
    await nextTick()
    await new Promise((r) => setTimeout(r, 0)) // let reloads settle
    // Chapter content must be re-fetched (cache was cleared) so the
    // reader doesn't degrade to permanent skeletons.
    expect(mockFetchChapter).toHaveBeenCalled()
    expect(store.chapterCache.size).toBeGreaterThan(0)
  })

  it('markRead decrements unread_count exactly once across confirm', async () => {
    mockFetchStoryline.mockResolvedValue(
      detail({
        id: 1,
        unread_count: 2,
        chapters: [
          chapterMeta({ id: 3, read_at: null }),
          chapterMeta({ id: 4, seq: 2, read_at: null }),
          chapterMeta({
            id: 5,
            seq: 3,
            state: 'draft',
            published_at: null,
          }),
        ],
      }),
    )
    mockFetchStorylines.mockResolvedValue({
      items: [summary({ id: 1, unread_count: 2 })],
      total: 1,
      limit: 20,
      offset: 0,
    })
    // Server timestamp deliberately differs from the optimistic one.
    mockMarkChapterRead.mockResolvedValue(
      chapterMeta({ id: 3, read_at: '2001-01-01T00:00:00Z' }),
    )
    const store = useStorylinesStore()
    await store.loadStorylines()
    await store.loadStoryline(1)
    await store.markRead(1, 3)
    expect(store.currentStoryline?.unread_count).toBe(1)
    expect(store.storylines[0].unread_count).toBe(1)
  })

  it('a terminal job for another storyline leaves the current one alone', async () => {
    mockFetchStoryline.mockResolvedValue(detail({ id: 2 }))
    mockFetchStorylines.mockResolvedValue({
      items: [summary({ id: 1 }), summary({ id: 2 })],
      total: 2,
      limit: 20,
      offset: 0,
    })
    mockFetchChapter.mockResolvedValue({
      ...chapterMeta({ id: 3 }),
      segments: [],
      addenda: [],
      model_used: 'm',
      generated_at: null,
    })
    mockCreateStoryline.mockResolvedValue({
      storyline: detail({ id: 1 }),
      bootstrap_job_id: 'jA',
    })
    jobStatuses.value = new Map([['jA', 'running']])
    const store = useStorylinesStore()
    await store.createStoryline({ entity_ids: [1], name: 'A' }) // tracks jA for storyline 1
    await store.loadStoryline(2) // user navigates to B
    await store.loadChapter(2, 3)
    mockFetchStoryline.mockClear()

    jobStatuses.value = new Map([['jA', 'succeeded']])
    await nextTick()
    await new Promise((r) => setTimeout(r, 0))
    // Detail must NOT be replaced with storyline 1, and B's cache survives.
    expect(mockFetchStoryline).not.toHaveBeenCalledWith(1)
    expect(store.currentStoryline?.id).toBe(2)
    expect(store.chapterCache.size).toBe(1)
  })

  it('updating stays true across clearCurrent and overlapping jobs', async () => {
    mockRefreshStoryline.mockResolvedValue({ job_id: 'j1', status: 'queued' })
    mockUnpublishNewest.mockResolvedValue({ job_id: 'j2', status: 'queued' })
    mockFetchStoryline.mockResolvedValue(detail({ id: 1 }))
    mockFetchStorylines.mockResolvedValue({
      items: [summary({ id: 1 })],
      total: 1,
      limit: 20,
      offset: 0,
    })
    jobStatuses.value = new Map([
      ['j1', 'running'],
      ['j2', 'running'],
    ])
    const store = useStorylinesStore()
    await store.refresh(1)
    await store.unpublishNewest(1)
    expect(store.updating).toBe(true)
    store.clearCurrent()
    expect(store.updating).toBe(true) // jobs still running

    jobStatuses.value = new Map([
      ['j1', 'succeeded'],
      ['j2', 'running'],
    ])
    await nextTick()
    expect(store.updating).toBe(true) // one of two still running

    jobStatuses.value = new Map([
      ['j1', 'succeeded'],
      ['j2', 'succeeded'],
    ])
    await nextTick()
    expect(store.updating).toBe(false)
  })
})
