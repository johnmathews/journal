import { describe, it, expect, vi, beforeEach } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createRouter, createWebHistory } from 'vue-router'
import StorylineDetailView from '../StorylineDetailView.vue'
import ChapterReader from '@/components/storylines/ChapterReader.vue'
import DraftBlock from '@/components/storylines/DraftBlock.vue'

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

// The inline anchor editor searches entities; stub the API so tests
// that never touch the search box don't need network-shaped fixtures.
vi.mock('@/api/entities', () => ({
  fetchEntities: vi.fn(),
}))

// useJobsStore is only used for trackJob/getJobById here. Stub it so we
// don't have to pull in the entire jobs polling machinery.
const trackJob = vi.fn()
const getJobById = vi.fn(() => undefined)
vi.mock('@/stores/jobs', () => ({
  useJobsStore: () => ({ trackJob, getJobById }),
}))

const toastSuccess = vi.fn()
vi.mock('@/composables/useToast', () => ({
  useToast: () => ({ success: toastSuccess, error: vi.fn() }),
}))

import {
  deleteStoryline,
  fetchChapter,
  fetchStoryline,
  markChapterRead,
  refreshStoryline,
  renameChapter,
  unpublishNewest,
} from '@/api/storylines'
const mockFetchStoryline = vi.mocked(fetchStoryline)
const mockFetchChapter = vi.mocked(fetchChapter)
const mockDelete = vi.mocked(deleteStoryline)
const mockRefresh = vi.mocked(refreshStoryline)
const mockUnpublish = vi.mocked(unpublishNewest)
const mockMarkRead = vi.mocked(markChapterRead)
const mockRenameChapter = vi.mocked(renameChapter)

function chapterMeta(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 70,
    seq: 1,
    title: 'The Build-Up',
    state: 'published' as const,
    entry_count: 3,
    first_entry_date: '2026-01-01',
    last_entry_date: '2026-02-01',
    published_at: '2026-02-02T00:00:00Z',
    read_at: null,
    citation_count: 1,
    ...overrides,
  }
}

function chapterDetail(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    ...chapterMeta(),
    segments: [
      { kind: 'text' as const, text: 'A consistent runner. ' },
      { kind: 'citation' as const, entry_id: 11, quote: 'I ran 5km.' },
    ],
    addenda: [],
    model_used: 'opus',
    generated_at: '2026-02-02T00:00:00Z',
    ...overrides,
  }
}

function mockDetail(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 3,
    anchors: [{ entity_id: 513, canonical_name: 'Vienna' }],
    name: 'Vienna trips',
    description: '',
    status: 'active' as const,
    unread_count: 1,
    chapter_count: 2,
    created_at: '2026-05-10T00:00:00Z',
    updated_at: '2026-05-12T10:00:00Z',
    chapters: [
      chapterMeta({ id: 70, seq: 1 }),
      chapterMeta({
        id: 71,
        seq: 2,
        state: 'draft',
        title: '',
        published_at: null,
        entry_count: 2,
      }),
    ],
    ...overrides,
  }
}

function makeRouter() {
  return createRouter({
    history: createWebHistory(),
    routes: [
      { path: '/', name: 'root', component: { template: '<div />' } },
      {
        path: '/storylines',
        name: 'storylines',
        component: { template: '<div />' },
      },
      {
        path: '/storylines/:id',
        name: 'storyline-detail',
        component: StorylineDetailView,
        props: true,
      },
      {
        path: '/entities/:id',
        name: 'entity-detail',
        component: { template: '<div />' },
      },
      {
        path: '/entries/:id',
        name: 'entry-detail',
        component: { template: '<div />' },
      },
    ],
  })
}

async function mountView(id = '3') {
  const router = makeRouter()
  await router.push(`/storylines/${id}`)
  await router.isReady()
  const wrapper = mount(StorylineDetailView, {
    props: { id },
    attachTo: document.body,
    global: { plugins: [createPinia(), router] },
  })
  await flushPromises()
  return wrapper
}

describe('StorylineDetailView (reader)', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    mockFetchStoryline.mockResolvedValue(mockDetail() as never)
    mockFetchChapter.mockImplementation(
      async (_sid: number, cid: number) =>
        chapterDetail(
          cid === 71
            ? { id: 71, seq: 2, state: 'draft', published_at: null }
            : { id: cid },
        ) as never,
    )
  })

  it('renders one ChapterReader per published chapter and one DraftBlock', async () => {
    const wrapper = await mountView()
    expect(wrapper.findAllComponents(ChapterReader)).toHaveLength(1)
    expect(wrapper.findAllComponents(DraftBlock)).toHaveLength(1)
    expect(wrapper.find('[data-testid="chapter-reader-70"]').exists()).toBe(
      true,
    )
    expect(wrapper.find('[data-testid="draft-block"]').exists()).toBe(true)
  })

  it('loads every chapter on mount (published + draft)', async () => {
    await mountView()
    expect(mockFetchChapter).toHaveBeenCalledWith(3, 70)
    expect(mockFetchChapter).toHaveBeenCalledWith(3, 71)
  })

  it('renders the TOC with an unread dot for the unread chapter', async () => {
    const wrapper = await mountView()
    expect(wrapper.find('[data-testid="chapter-toc"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="toc-unread-dot"]').exists()).toBe(true)
  })

  it('TOC select scrolls the chapter into view', async () => {
    const wrapper = await mountView()
    const scrollSpy = vi.fn()
    Element.prototype.scrollIntoView = scrollSpy
    await wrapper.find('[data-testid="toc-item-70"]').trigger('click')
    expect(scrollSpy).toHaveBeenCalled()
  })

  it('chapter visibility marks it read exactly once', async () => {
    mockMarkRead.mockResolvedValue(
      chapterMeta({ read_at: '2026-07-12T00:00:00Z' }) as never,
    )
    const wrapper = await mountView()
    const reader = wrapper.findComponent(ChapterReader)
    reader.vm.$emit('visible', 70)
    reader.vm.$emit('visible', 70)
    await flushPromises()
    // Store guards the second call because read_at is set locally first.
    expect(mockMarkRead).toHaveBeenCalledTimes(1)
    expect(mockMarkRead).toHaveBeenCalledWith(3, 70)
  })

  it('visibility on an already-read chapter never calls the API', async () => {
    mockFetchStoryline.mockResolvedValue(
      mockDetail({
        unread_count: 0,
        chapters: [
          chapterMeta({ id: 70, read_at: '2026-07-01T00:00:00Z' }),
          chapterMeta({
            id: 71,
            seq: 2,
            state: 'draft',
            published_at: null,
          }),
        ],
      }) as never,
    )
    const wrapper = await mountView()
    wrapper.findComponent(ChapterReader).vm.$emit('visible', 70)
    await flushPromises()
    expect(mockMarkRead).not.toHaveBeenCalled()
  })

  it('draft refresh queues a job via the store', async () => {
    mockRefresh.mockResolvedValue({ job_id: 'j9', status: 'queued' })
    const wrapper = await mountView()
    await wrapper.find('[data-testid="draft-refresh-button"]').trigger('click')
    await flushPromises()
    expect(mockRefresh).toHaveBeenCalledWith(3)
    expect(trackJob).toHaveBeenCalledWith('j9', 'storyline_update')
  })

  it('unpublish emits from the newest chapter and confirms first', async () => {
    mockUnpublish.mockResolvedValue({ job_id: 'j10', status: 'queued' })
    const confirmSpy = vi.fn(() => true)
    vi.stubGlobal('confirm', confirmSpy)
    const wrapper = await mountView()
    wrapper.findComponent(ChapterReader).vm.$emit('unpublish', 70)
    await flushPromises()
    expect(confirmSpy).toHaveBeenCalled()
    expect(mockUnpublish).toHaveBeenCalledWith(3)
    vi.unstubAllGlobals()
  })

  it('unpublish is aborted when the confirm is declined', async () => {
    const confirmSpy = vi.fn(() => false)
    vi.stubGlobal('confirm', confirmSpy)
    const wrapper = await mountView()
    wrapper.findComponent(ChapterReader).vm.$emit('unpublish', 70)
    await flushPromises()
    expect(mockUnpublish).not.toHaveBeenCalled()
    vi.unstubAllGlobals()
  })

  it('rename event goes through the store to the API', async () => {
    mockRenameChapter.mockResolvedValue(
      chapterMeta({ title: 'Renamed' }) as never,
    )
    const wrapper = await mountView()
    wrapper.findComponent(ChapterReader).vm.$emit('rename', 70, 'Renamed')
    await flushPromises()
    expect(mockRenameChapter).toHaveBeenCalledWith(3, 70, {
      title: 'Renamed',
    })
  })

  it('shows the unread count chip in the meta strip', async () => {
    const wrapper = await mountView()
    expect(
      wrapper.find('[data-testid="storyline-unread-count"]').text(),
    ).toContain('1 unread')
  })

  it('delete confirms and navigates back to the list', async () => {
    mockDelete.mockResolvedValue({ deleted: true })
    const confirmSpy = vi.fn(() => true)
    vi.stubGlobal('confirm', confirmSpy)
    const wrapper = await mountView()
    await wrapper.find('[data-testid="delete-button"]').trigger('click')
    await flushPromises()
    expect(mockDelete).toHaveBeenCalledWith(3)
    vi.unstubAllGlobals()
  })

  it('renders anchors with entity links', async () => {
    const wrapper = await mountView()
    const anchor = wrapper.find('[data-testid="storyline-anchor-513"]')
    expect(anchor.exists()).toBe(true)
    expect(anchor.text()).toContain('Vienna')
  })

  it('shows an error banner when the storyline fails to load', async () => {
    mockFetchStoryline.mockRejectedValue(new Error('boom'))
    const wrapper = await mountView()
    expect(wrapper.find('[data-testid="error-banner"]').text()).toContain(
      'boom',
    )
  })
})

describe('StorylineDetailView — header flows', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    mockFetchStoryline.mockResolvedValue(mockDetail() as never)
    mockFetchChapter.mockImplementation(
      async (_sid: number, cid: number) => chapterDetail({ id: cid }) as never,
    )
  })

  it('inline title edit saves through the store', async () => {
    const { updateStoryline } = await import('@/api/storylines')
    vi.mocked(updateStoryline).mockResolvedValue({
      ...mockDetail(),
      name: 'Trips to Vienna',
    } as never)
    const wrapper = await mountView()
    await wrapper.find('[data-testid="edit-name-button"]').trigger('click')
    await wrapper
      .find('[data-testid="storyline-name-input"]')
      .setValue('Trips to Vienna')
    await wrapper.find('[data-testid="storyline-name-form"]').trigger('submit')
    await flushPromises()
    expect(vi.mocked(updateStoryline)).toHaveBeenCalledWith(3, {
      name: 'Trips to Vienna',
    })
    expect(wrapper.find('[data-testid="storyline-name-heading"]').text()).toBe(
      'Trips to Vienna',
    )
  })

  it('title edit cancel restores the heading without saving', async () => {
    const { updateStoryline } = await import('@/api/storylines')
    const wrapper = await mountView()
    await wrapper.find('[data-testid="edit-name-button"]').trigger('click')
    await wrapper.find('[data-testid="cancel-name-button"]').trigger('click')
    expect(vi.mocked(updateStoryline)).not.toHaveBeenCalled()
    expect(
      wrapper.find('[data-testid="storyline-name-heading"]').exists(),
    ).toBe(true)
  })

  it('toggles the inline anchor editor open and closed', async () => {
    const wrapper = await mountView()
    await wrapper.find('[data-testid="edit-anchors-button"]').trigger('click')
    expect(wrapper.find('[data-testid="anchor-editor"]').exists()).toBe(true)
    await wrapper.find('[data-testid="edit-anchors-button"]').trigger('click')
    expect(wrapper.find('[data-testid="anchor-editor"]').exists()).toBe(false)
  })

  it('shows the action error banner when a refresh fails', async () => {
    mockRefresh.mockRejectedValue(new Error('engine unavailable'))
    const wrapper = await mountView()
    await wrapper.find('[data-testid="draft-refresh-button"]').trigger('click')
    await flushPromises()
    expect(
      wrapper.find('[data-testid="action-error-banner"]').text(),
    ).toContain('engine unavailable')
  })

  it('delete declined leaves the storyline in place', async () => {
    const confirmSpy = vi.fn(() => false)
    vi.stubGlobal('confirm', confirmSpy)
    const wrapper = await mountView()
    await wrapper.find('[data-testid="delete-button"]').trigger('click')
    expect(mockDelete).not.toHaveBeenCalled()
    vi.unstubAllGlobals()
  })

  it('markUnread flows from the chapter menu event to the API', async () => {
    const { markChapterUnread } = await import('@/api/storylines')
    vi.mocked(markChapterUnread).mockResolvedValue(
      chapterMeta({ read_at: null }) as never,
    )
    const wrapper = await mountView()
    wrapper.findComponent(ChapterReader).vm.$emit('markUnread', 70)
    await flushPromises()
    expect(vi.mocked(markChapterUnread)).toHaveBeenCalledWith(3, 70)
  })

  it('honours a valid ?chapter= query as the initial scroll target', async () => {
    const scrollSpy = vi.fn()
    Element.prototype.scrollIntoView = scrollSpy
    const router = makeRouter()
    await router.push('/storylines/3?chapter=70')
    await router.isReady()
    mount(StorylineDetailView, {
      props: { id: '3' },
      attachTo: document.body,
      global: { plugins: [createPinia(), router] },
    })
    await flushPromises()
    expect(scrollSpy).toHaveBeenCalled()
  })

  it('shows the updating indicator while a job is in flight', async () => {
    mockRefresh.mockResolvedValue({ job_id: 'j1', status: 'queued' })
    getJobById.mockReturnValue({ id: 'j1', status: 'running' } as never)
    const wrapper = await mountView()
    await wrapper.find('[data-testid="draft-refresh-button"]').trigger('click')
    await flushPromises()
    expect(wrapper.find('[data-testid="storyline-updating"]').exists()).toBe(
      true,
    )
    getJobById.mockReturnValue(undefined)
  })
})
