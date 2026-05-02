import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createRouter, createMemoryHistory } from 'vue-router'
import JobHistoryView from '../JobHistoryView.vue'
import type { Job } from '@/types/job'

const mockListJobs = vi.fn()
const mockGetJob = vi.fn()

vi.mock('@/api/jobs', () => ({
  listJobs: (...args: unknown[]) => mockListJobs(...args),
  getJob: (...args: unknown[]) => mockGetJob(...args),
  triggerMoodBackfill: vi.fn(),
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
    routes: [
      { path: '/jobs', name: 'job-history', component: JobHistoryView },
      {
        path: '/entries/:id',
        name: 'entry-detail',
        component: { template: '<div />' },
        props: true,
      },
    ],
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

  it('shows entry link for jobs with entry_id in params', async () => {
    const wrapper = await mountView([makeJob({ params: { entry_id: 42 } })])
    const link = wrapper.find('[data-testid="entry-link"]')
    expect(link.exists()).toBe(true)
    expect(link.text()).toBe('#42')
  })

  it('shows entry link for jobs with entry_id in result', async () => {
    const wrapper = await mountView([
      makeJob({
        params: {},
        result: { entry_id: 99, word_count: 50 },
        type: 'ingest_images',
      }),
    ])
    const link = wrapper.find('[data-testid="entry-link"]')
    expect(link.exists()).toBe(true)
    expect(link.text()).toBe('#99')
  })

  it('shows dash when no entry_id present', async () => {
    const wrapper = await mountView([
      makeJob({ params: {}, result: { scored: 5 }, type: 'mood_backfill' }),
    ])
    const row = wrapper.find('[data-testid="job-row-j-1"]')
    const cells = row.findAll('td')
    // Entry column is the 3rd cell (index 2)
    expect(cells[2].text()).toBe('-')
  })

  it('shows params summary without entry_id', async () => {
    const wrapper = await mountView([
      makeJob({ params: { entry_id: 42, stale_only: true, mode: 'force' } }),
    ])
    expect(wrapper.text()).toContain('stale only')
    expect(wrapper.text()).toContain('force')
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
    expect(wrapper.text()).toContain('Entities Created: 5')
  })

  it('shows ingestion result summary with word and chunk counts', async () => {
    const wrapper = await mountView([
      makeJob({
        type: 'ingest_images',
        status: 'succeeded',
        result: {
          entry_id: 10,
          word_count: 250,
          chunk_count: 5,
          page_count: 3,
          entry_date: '2026-04-13',
          source_type: 'photo',
          follow_up_jobs: {},
        },
      }),
    ])
    expect(wrapper.text()).toContain('250 words')
    expect(wrapper.text()).toContain('5 chunks')
    expect(wrapper.text()).toContain('3 pages')
  })

  it('shows audio ingestion with recording count', async () => {
    const wrapper = await mountView([
      makeJob({
        type: 'ingest_audio',
        status: 'succeeded',
        result: {
          entry_id: 11,
          word_count: 120,
          chunk_count: 2,
          recording_count: 1,
          entry_date: '2026-04-14',
          source_type: 'voice',
          follow_up_jobs: {},
        },
      }),
    ])
    expect(wrapper.text()).toContain('120 words')
    expect(wrapper.text()).toContain('1 recording')
  })

  it('shows dash for params with no recognized fields', async () => {
    const wrapper = await mountView([makeJob({ params: {} })])
    const row = wrapper.find('[data-testid="job-row-j-1"]')
    const cells = row.findAll('td')
    // Params column is index 3 now (Type, Status, Entry, Params)
    expect(cells[3].text()).toBe('-')
  })

  it('shows dash for duration when no timestamps', async () => {
    const wrapper = await mountView([
      makeJob({ started_at: null, finished_at: null }),
    ])
    const row = wrapper.find('[data-testid="job-row-j-1"]')
    const cells = row.findAll('td')
    // Duration column is index 5 (Type, Status, Entry, Params, Created, Duration)
    expect(cells[5].text()).toBe('-')
  })

  it('shows stale_only and mode params', async () => {
    const wrapper = await mountView([
      makeJob({ params: { stale_only: true, mode: 'force' } }),
    ])
    expect(wrapper.text()).toContain('stale only')
    expect(wrapper.text()).toContain('force')
  })

  it('shows date range params as a chip', async () => {
    const wrapper = await mountView([
      makeJob({ params: { start_date: '2026-01-01', end_date: '2026-03-01' } }),
    ])
    const chip = wrapper.find('[data-testid="param-chip-date_range"]')
    expect(chip.exists()).toBe(true)
    expect(chip.text()).toContain('2026-01-01')
    expect(chip.text()).toContain('2026-03-01')
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

  it('renders type badges with color classes', async () => {
    const wrapper = await mountView([
      makeJob({ id: 'j1', type: 'entity_extraction' }),
      makeJob({ id: 'j2', type: 'ingest_images' }),
      makeJob({ id: 'j3', type: 'mood_backfill' }),
    ])
    const typeBadges = wrapper.findAll('[data-testid="type-badge"]')
    expect(typeBadges.length).toBe(3)
    // Entity extraction should have blue classes
    expect(typeBadges[0].classes()).toContain('bg-blue-100')
    // Image ingestion should have teal classes
    expect(typeBadges[1].classes()).toContain('bg-teal-100')
    // Mood backfill should have amber classes
    expect(typeBadges[2].classes()).toContain('bg-amber-100')
  })

  it('shows relative time next to absolute time', async () => {
    const wrapper = await mountView([makeJob()])
    const relTime = wrapper.find('[data-testid="relative-time"]')
    expect(relTime.exists()).toBe(true)
    // Should contain some relative time text (e.g., "Xd ago", "Xmo ago")
    expect(relTime.text()).toMatch(/ago|just now/)
  })

  it('does not show pagination when total fits one page', async () => {
    const wrapper = await mountView([makeJob()], 5)
    expect(wrapper.find('[data-testid="prev-page"]').exists()).toBe(false)
  })

  it('expands details and hides internal keys', async () => {
    const wrapper = await mountView([
      makeJob({
        type: 'ingest_images',
        status: 'succeeded',
        result: {
          entry_id: 10,
          word_count: 250,
          chunk_count: 5,
          page_count: 3,
          warnings: ['low contrast'],
          entry_date: '2026-04-13',
          source_type: 'photo',
          follow_up_jobs: {},
        },
      }),
    ])
    // Click to expand
    await wrapper
      .find('[data-testid="job-details-toggle-j-1"]')
      .trigger('click')
    await flushPromises()

    const details = wrapper.find('[data-testid="expanded-details"]')
    expect(details.exists()).toBe(true)

    // Should show word_count, chunk_count, page_count
    expect(details.text()).toContain('Word Count')
    expect(details.text()).toContain('Chunk Count')
    expect(details.text()).toContain('Page Count')

    // Should NOT show hidden keys
    expect(details.text()).not.toContain('Entry Id')
    expect(details.text()).not.toContain('Follow Up Jobs')
    expect(details.text()).not.toContain('Entry Date')
    expect(details.text()).not.toContain('Source Type')
  })

  it('expanded details uses normal text size (no text-xs)', async () => {
    const wrapper = await mountView([
      makeJob({
        status: 'succeeded',
        result: { entities_created: 5, entities_matched: 2 },
      }),
    ])
    await wrapper
      .find('[data-testid="job-details-toggle-j-1"]')
      .trigger('click')
    await flushPromises()

    const details = wrapper.find('[data-testid="expanded-details"]')
    expect(details.exists()).toBe(true)
    // Should NOT have text-xs class (inherits text-sm from table)
    expect(details.classes()).not.toContain('text-xs')
  })

  it('fetches follow-up job statuses on expand', async () => {
    mockGetJob.mockImplementation((jobId: string) => {
      if (jobId === 'mood-123') {
        return Promise.resolve(
          makeJob({
            id: 'mood-123',
            type: 'mood_score_entry',
            status: 'succeeded',
          }),
        )
      }
      if (jobId === 'entity-456') {
        return Promise.resolve(
          makeJob({
            id: 'entity-456',
            type: 'entity_extraction',
            status: 'running',
          }),
        )
      }
      return Promise.reject(new Error('not found'))
    })

    const wrapper = await mountView([
      makeJob({
        type: 'ingest_images',
        status: 'succeeded',
        result: {
          entry_id: 10,
          word_count: 250,
          chunk_count: 5,
          page_count: 3,
          follow_up_jobs: {
            mood_scoring: 'mood-123',
            entity_extraction: 'entity-456',
          },
        },
      }),
    ])

    // Expand details
    await wrapper
      .find('[data-testid="job-details-toggle-j-1"]')
      .trigger('click')
    await flushPromises()

    // Should have called getJob for both follow-ups
    expect(mockGetJob).toHaveBeenCalledWith('mood-123')
    expect(mockGetJob).toHaveBeenCalledWith('entity-456')

    // Should show follow-up badges
    const followUps = wrapper.find('[data-testid="follow-up-jobs"]')
    expect(followUps.exists()).toBe(true)
    const badges = followUps.findAll('[data-testid="follow-up-badge"]')
    expect(badges.length).toBe(2)
  })

  it('pluralizes page_count and recording_count correctly', async () => {
    const wrapper = await mountView([
      makeJob({
        id: 'j-single',
        type: 'ingest_images',
        status: 'succeeded',
        result: {
          entry_id: 1,
          word_count: 50,
          chunk_count: 1,
          page_count: 1,
          follow_up_jobs: {},
        },
      }),
      makeJob({
        id: 'j-multi',
        type: 'ingest_audio',
        status: 'succeeded',
        result: {
          entry_id: 2,
          word_count: 100,
          chunk_count: 2,
          recording_count: 3,
          follow_up_jobs: {},
        },
      }),
    ])
    const rows = wrapper.findAll('tr')
    // First data row (index 1, skipping header) should have "1 page"
    expect(rows[1].text()).toContain('1 page')
    expect(rows[1].text()).not.toContain('1 pages')
    // Second data row should have "3 recordings"
    expect(rows[2].text()).toContain('3 recordings')
  })

  it('shows "Entry #N" summary for old-format ingestion results', async () => {
    const wrapper = await mountView([
      makeJob({
        type: 'ingest_audio',
        status: 'succeeded',
        result: { entry_id: 75 },
      }),
    ])
    // Should show "Entry #75" not raw JSON
    expect(wrapper.text()).toContain('Entry #75')
    expect(wrapper.text()).not.toContain('{"entry_id":75}')
  })

  it('renders reprocess_embeddings result as static (not expandable) when only chunk_count', async () => {
    const wrapper = await mountView([
      makeJob({
        type: 'reprocess_embeddings',
        status: 'succeeded',
        result: { entry_id: 78, chunk_count: 9 },
      }),
    ])
    expect(
      wrapper.find('[data-testid="job-details-toggle-j-1"]').exists(),
    ).toBe(false)
    const staticEl = wrapper.find('[data-testid="job-details-static-j-1"]')
    expect(staticEl.exists()).toBe(true)
    expect(staticEl.text()).toContain('Chunk Count: 9')
    expect(staticEl.text()).not.toContain('+')
  })

  it('renders mood_score_entry result as static when only scores_written', async () => {
    const wrapper = await mountView([
      makeJob({
        type: 'mood_score_entry',
        status: 'succeeded',
        result: { entry_id: 78, scores_written: 7 },
      }),
    ])
    expect(
      wrapper.find('[data-testid="job-details-toggle-j-1"]').exists(),
    ).toBe(false)
    expect(
      wrapper.find('[data-testid="job-details-static-j-1"]').exists(),
    ).toBe(true)
  })

  it('keeps entity_extraction expandable when it has multiple result fields', async () => {
    const wrapper = await mountView([
      makeJob({
        type: 'entity_extraction',
        status: 'succeeded',
        result: {
          entries_processed: 1,
          entities_created: 3,
          entities_matched: 9,
        },
      }),
    ])
    expect(
      wrapper.find('[data-testid="job-details-toggle-j-1"]').exists(),
    ).toBe(true)
  })

  it('keeps row expandable when result has follow_up_jobs', async () => {
    const wrapper = await mountView([
      makeJob({
        type: 'ingest_images',
        status: 'succeeded',
        result: {
          entry_id: 1,
          chunk_count: 5,
          word_count: 100,
          follow_up_jobs: { mood_scoring: 'mood-1' },
        },
      }),
    ])
    expect(
      wrapper.find('[data-testid="job-details-toggle-j-1"]').exists(),
    ).toBe(true)
  })

  it('shows a "full" popover trigger for long error messages', async () => {
    const longError =
      'Connection refused after 3 attempts: tried 10.0.0.1:5432, then 10.0.0.2:5432, then localhost:5432'
    const wrapper = await mountView([
      makeJob({ status: 'failed', error_message: longError }),
    ])
    expect(
      wrapper.find('[data-testid="job-error-full-popover"]').exists(),
    ).toBe(true)
  })

  it('does not show "full" popover for short error messages', async () => {
    const wrapper = await mountView([
      makeJob({ status: 'failed', error_message: 'timeout' }),
    ])
    expect(
      wrapper.find('[data-testid="job-error-full-popover"]').exists(),
    ).toBe(false)
  })

  it('shows entry_id in expanded details when it is the only field', async () => {
    const wrapper = await mountView([
      makeJob({
        type: 'ingest_audio',
        status: 'succeeded',
        result: { entry_id: 75 },
      }),
    ])
    await wrapper
      .find('[data-testid="job-details-toggle-j-1"]')
      .trigger('click')
    await flushPromises()

    const details = wrapper.find('[data-testid="expanded-details"]')
    expect(details.exists()).toBe(true)
    // Should fall back to showing entry_id since it's the only field
    expect(details.text()).toContain('Entry Id')
    expect(details.text()).toContain('75')
  })
})
