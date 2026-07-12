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
    mockMarkChapterUnread.mockResolvedValue(chapterMeta({ id: 3, read_at: null }))
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
