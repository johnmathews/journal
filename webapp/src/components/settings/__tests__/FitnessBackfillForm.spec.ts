import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import { createRouter, createMemoryHistory } from 'vue-router'
import FitnessBackfillForm from '../FitnessBackfillForm.vue'
import { ApiRequestError } from '@/api/client'

vi.mock('@/api/fitness', () => ({
  triggerBackfill: vi.fn(),
}))

// On success the form registers the job via jobsStore.trackJob, which
// would start a real polling loop with real fetches. Stub the store.
vi.mock('@/stores/jobs', () => ({
  useJobsStore: () => ({ trackJob: vi.fn() }),
}))

import { triggerBackfill } from '@/api/fitness'
const mockTriggerBackfill = vi.mocked(triggerBackfill)

const router = createRouter({
  history: createMemoryHistory(),
  routes: [
    { path: '/jobs', name: 'job-history', component: { template: '<div/>' } },
  ],
})

function mountForm(source: 'strava' | 'garmin' = 'strava') {
  return mount(FitnessBackfillForm, {
    props: { source },
    global: { plugins: [router] },
  })
}

describe('FitnessBackfillForm', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  it('defaults start to 2026-01-01 and leaves end blank', () => {
    const wrapper = mountForm('strava')
    const start = wrapper.get('[data-testid="backfill-strava-start"]')
      .element as HTMLInputElement
    const end = wrapper.get('[data-testid="backfill-strava-end"]')
      .element as HTMLInputElement
    expect(start.value).toBe('2026-01-01')
    expect(end.value).toBe('')
  })

  it('submits the start date only when end is blank', async () => {
    mockTriggerBackfill.mockResolvedValue({
      job_id: 'job-bf1',
      status: 'queued' as const,
    })

    const wrapper = mountForm('garmin')
    await wrapper.get('[data-testid="backfill-garmin-submit"]').trigger('click')
    await flushPromises()

    expect(mockTriggerBackfill).toHaveBeenCalledWith('garmin', {
      start: '2026-01-01',
    })
  })

  it('includes end in the request body when filled in', async () => {
    mockTriggerBackfill.mockResolvedValue({
      job_id: 'job-bf2',
      status: 'queued' as const,
    })

    const wrapper = mountForm('strava')
    await wrapper
      .get('[data-testid="backfill-strava-end"]')
      .setValue('2026-03-01')
    await wrapper.get('[data-testid="backfill-strava-submit"]').trigger('click')
    await flushPromises()

    expect(mockTriggerBackfill).toHaveBeenCalledWith('strava', {
      start: '2026-01-01',
      end: '2026-03-01',
    })
  })

  it('renders a success message with a router link to /jobs on success', async () => {
    mockTriggerBackfill.mockResolvedValue({
      job_id: 'job-bf3',
      status: 'queued' as const,
    })

    const wrapper = mountForm('strava')
    await wrapper.get('[data-testid="backfill-strava-submit"]').trigger('click')
    await flushPromises()

    const result = wrapper.get('[data-testid="backfill-strava-result"]')
    expect(result.text()).toContain('Backfill queued')
    const link = wrapper.get('[data-testid="backfill-strava-job-link"]')
    expect(link.text()).toBe('job-bf3')
    expect(link.attributes('href')).toBe('/jobs')
  })

  it('surfaces already_running as a distinct success message', async () => {
    mockTriggerBackfill.mockResolvedValue({
      job_id: 'job-running',
      status: 'running' as const,
      already_running: true,
    })

    const wrapper = mountForm('garmin')
    await wrapper.get('[data-testid="backfill-garmin-submit"]').trigger('click')
    await flushPromises()

    const result = wrapper.get('[data-testid="backfill-garmin-result"]')
    expect(result.text()).toContain('Already running')
    expect(result.text()).toContain('job-running')
  })

  it('renders an error message when the API rejects', async () => {
    mockTriggerBackfill.mockRejectedValue(
      new ApiRequestError(400, 'bad_request', 'end < start'),
    )

    const wrapper = mountForm('strava')
    await wrapper.get('[data-testid="backfill-strava-submit"]').trigger('click')
    await flushPromises()

    const err = wrapper.get('[data-testid="backfill-strava-error"]')
    expect(err.text()).toContain('end < start')
  })

  it('disables the submit button while a request is in flight', async () => {
    let resolve: (v: { job_id: string; status: 'queued' }) => void = () => {}
    mockTriggerBackfill.mockReturnValue(
      new Promise((r) => {
        resolve = r
      }),
    )

    const wrapper = mountForm('strava')
    const btn = wrapper.get('[data-testid="backfill-strava-submit"]')
    await btn.trigger('click')
    expect((btn.element as HTMLButtonElement).disabled).toBe(true)
    expect(btn.text()).toBe('Queueing…')

    resolve({ job_id: 'job-x', status: 'queued' })
    await flushPromises()
    expect((btn.element as HTMLButtonElement).disabled).toBe(false)
  })
})
