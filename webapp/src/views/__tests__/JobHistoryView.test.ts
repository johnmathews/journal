import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createRouter, createMemoryHistory } from 'vue-router'
import JobHistoryView from '../JobHistoryView.vue'
import type { Job } from '@/types/job'

const mockListJobs = vi.fn()

vi.mock('@/api/jobs', () => ({
  listJobs: (...args: unknown[]) => mockListJobs(...args),
  triggerMoodBackfill: vi.fn(),
  getJob: vi.fn(),
}))

function makeJob(overrides: Partial<Job> = {}): Job {
  return {
    id: 'j-1',
    type: 'entity_extraction',
    status: 'succeeded',
    params: { entry_id: 42 },
    progress_current: 1,
    progress_total: 1,
    result: { entities_created: 3 },
    error_message: null,
    status_detail: null,
    created_at: '2026-04-13T10:00:00Z',
    started_at: '2026-04-13T10:00:01Z',
    finished_at: '2026-04-13T10:00:05Z',
    ...overrides,
  }
}

function makeRouter() {
  return createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/jobs', name: 'job-history', component: JobHistoryView }],
  })
}

describe('JobHistoryView', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  async function mountView(jobs: Job[] = [], total?: number) {
    mockListJobs.mockResolvedValue({
      items: jobs,
      total: total ?? jobs.length,
      limit: 25,
      offset: 0,
    })
    const router = makeRouter()
    await router.push('/jobs')
    await router.isReady()
    const wrapper = mount(JobHistoryView, {
      global: { plugins: [createPinia(), router] },
    })
    await flushPromises()
    return wrapper
  }

  it('renders the page heading', async () => {
    const wrapper = await mountView()
    expect(wrapper.find('h1').text()).toBe('Job History')
  })

  it('shows empty state when no jobs', async () => {
    const wrapper = await mountView([])
    expect(wrapper.find('[data-testid="job-history-empty"]').exists()).toBe(
      true,
    )
  })

  it('renders job rows', async () => {
    const wrapper = await mountView([
      makeJob({ id: 'j-1', type: 'entity_extraction', status: 'succeeded' }),
      makeJob({
        id: 'j-2',
        type: 'mood_backfill',
        status: 'failed',
        error_message: 'timeout',
      }),
    ])
    expect(wrapper.find('[data-testid="job-history-table"]').exists()).toBe(
      true,
    )
    expect(wrapper.find('[data-testid="job-row-j-1"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="job-row-j-2"]').exists()).toBe(true)
    expect(wrapper.text()).toContain('Entity extraction')
    expect(wrapper.text()).toContain('Mood backfill')
    expect(wrapper.text()).toContain('timeout')
  })

  it('displays correct status badges', async () => {
    const wrapper = await mountView([
      makeJob({ id: 'j-1', status: 'succeeded' }),
      makeJob({ id: 'j-2', status: 'failed' }),
      makeJob({ id: 'j-3', status: 'running' }),
    ])
    const badges = wrapper.findAll('span.capitalize')
    const texts = badges.map((b) => b.text())
    expect(texts).toContain('succeeded')
    expect(texts).toContain('failed')
    expect(texts).toContain('running')
  })

  it('shows params summary', async () => {
    const wrapper = await mountView([makeJob({ params: { entry_id: 42 } })])
    expect(wrapper.text()).toContain('entry 42')
  })

  it('shows duration for completed jobs', async () => {
    const wrapper = await mountView([
      makeJob({
        started_at: '2026-04-13T10:00:00Z',
        finished_at: '2026-04-13T10:00:03Z',
      }),
    ])
    expect(wrapper.text()).toContain('3.0s')
  })

  it('filters by status', async () => {
    const wrapper = await mountView([makeJob()])
    const select = wrapper.find('[data-testid="filter-status"]')
    await select.setValue('failed')
    await flushPromises()
    expect(mockListJobs).toHaveBeenLastCalledWith(
      expect.objectContaining({ status: 'failed' }),
    )
  })

  it('filters by type', async () => {
    const wrapper = await mountView([makeJob()])
    const select = wrapper.find('[data-testid="filter-type"]')
    await select.setValue('mood_backfill')
    await flushPromises()
    expect(mockListJobs).toHaveBeenLastCalledWith(
      expect.objectContaining({ type: 'mood_backfill' }),
    )
  })

  it('shows error state', async () => {
    mockListJobs.mockRejectedValueOnce(new Error('Server down'))
    const router = makeRouter()
    await router.push('/jobs')
    await router.isReady()
    const wrapper = mount(JobHistoryView, {
      global: { plugins: [createPinia(), router] },
    })
    await flushPromises()
    expect(wrapper.find('[data-testid="job-history-error"]').exists()).toBe(
      true,
    )
    expect(wrapper.text()).toContain('Server down')
  })

  it('refresh button reloads data', async () => {
    const wrapper = await mountView([makeJob()])
    const callCount = mockListJobs.mock.calls.length
    await wrapper.find('[data-testid="refresh-button"]').trigger('click')
    await flushPromises()
    expect(mockListJobs.mock.calls.length).toBeGreaterThan(callCount)
  })

  it('shows pagination when total exceeds page size', async () => {
    const wrapper = await mountView([makeJob()], 30)
    expect(wrapper.find('[data-testid="prev-page"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="next-page"]').exists()).toBe(true)
    expect(wrapper.text()).toContain('Page 1 of 2')
    expect(wrapper.text()).toContain('30 total jobs')
  })

  it('navigates pages', async () => {
    const wrapper = await mountView([makeJob()], 30)
    await wrapper.find('[data-testid="next-page"]').trigger('click')
    await flushPromises()
    expect(mockListJobs).toHaveBeenLastCalledWith(
      expect.objectContaining({ offset: 25 }),
    )
  })

  it('shows running job with progress', async () => {
    const wrapper = await mountView([
      makeJob({
        id: 'j-run',
        status: 'running',
        progress_current: 5,
        progress_total: 20,
        started_at: null,
        finished_at: null,
      }),
    ])
    expect(wrapper.text()).toContain('5/20')
  })

  it('shows running job without progress as Running...', async () => {
    const wrapper = await mountView([
      makeJob({
        id: 'j-run2',
        status: 'running',
        progress_current: 0,
        progress_total: 0,
        started_at: null,
        finished_at: null,
      }),
    ])
    expect(wrapper.text()).toContain('Running...')
  })

  it('shows succeeded job result snippet', async () => {
    const wrapper = await mountView([
      makeJob({
        status: 'succeeded',
        result: { entities_created: 5, relationships: 2 },
      }),
    ])
    expect(wrapper.text()).toContain('entities_created')
  })

  it('shows dash for params with no recognized fields', async () => {
    const wrapper = await mountView([makeJob({ params: {} })])
    const row = wrapper.find('[data-testid="job-row-j-1"]')
    // The params column should show '-'
    const cells = row.findAll('td')
    expect(cells[2].text()).toBe('-')
  })

  it('shows dash for duration when no timestamps', async () => {
    const wrapper = await mountView([
      makeJob({ started_at: null, finished_at: null }),
    ])
    const row = wrapper.find('[data-testid="job-row-j-1"]')
    const cells = row.findAll('td')
    expect(cells[4].text()).toBe('-')
  })

  it('shows stale_only and mode params', async () => {
    const wrapper = await mountView([
      makeJob({ params: { stale_only: true, mode: 'force' } }),
    ])
    expect(wrapper.text()).toContain('stale only')
    expect(wrapper.text()).toContain('force')
  })

  it('shows date range params', async () => {
    const wrapper = await mountView([
      makeJob({ params: { start_date: '2026-01-01', end_date: '2026-03-01' } }),
    ])
    expect(wrapper.text()).toContain('2026-01-01 to 2026-03-01')
  })

  it('displays all job type labels correctly', async () => {
    const wrapper = await mountView([
      makeJob({ id: 'j1', type: 'entity_extraction' }),
      makeJob({ id: 'j2', type: 'mood_backfill' }),
      makeJob({ id: 'j3', type: 'mood_score_entry' }),
      makeJob({ id: 'j4', type: 'ingest_images' }),
    ])
    expect(wrapper.text()).toContain('Entity extraction')
    expect(wrapper.text()).toContain('Mood backfill')
    expect(wrapper.text()).toContain('Mood scoring')
    expect(wrapper.text()).toContain('Image ingestion')
  })

  it('does not show pagination when total fits one page', async () => {
    const wrapper = await mountView([makeJob()], 5)
    expect(wrapper.find('[data-testid="prev-page"]').exists()).toBe(false)
  })
})
