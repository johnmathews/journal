import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import JobParamsCell from '../JobParamsCell.vue'
import type { Job } from '@/types/job'

function makeJob(overrides: Partial<Job> = {}): Job {
  return {
    id: 'j-1',
    type: 'mood_backfill',
    status: 'succeeded',
    params: {},
    progress_current: 0,
    progress_total: 0,
    result: null,
    error_message: null,
    status_detail: null,
    created_at: '2026-04-13T10:00:00Z',
    started_at: null,
    finished_at: null,
    ...overrides,
  }
}

describe('JobParamsCell', () => {
  it('renders a date-range chip when both start and end are present', () => {
    const wrapper = mount(JobParamsCell, {
      props: {
        job: makeJob({
          params: { start_date: '2026-02-02', end_date: '2026-02-28' },
        }),
      },
    })
    const chip = wrapper.find('[data-testid="param-chip-date_range"]')
    expect(chip.exists()).toBe(true)
    expect(chip.text()).toContain('2026-02-02')
    expect(chip.text()).toContain('2026-02-28')
    expect(chip.text()).toContain('→')
  })

  it('renders mode chip with amber styling for "force"', () => {
    const wrapper = mount(JobParamsCell, {
      props: { job: makeJob({ params: { mode: 'force' } }) },
    })
    const chip = wrapper.find('[data-testid="param-chip-mode"]')
    expect(chip.exists()).toBe(true)
    expect(chip.text()).toBe('force')
    expect(chip.classes().some((c) => c.startsWith('bg-amber'))).toBe(true)
  })

  it('renders mode chip with neutral styling for "stale-only"', () => {
    const wrapper = mount(JobParamsCell, {
      props: { job: makeJob({ params: { mode: 'stale-only' } }) },
    })
    const chip = wrapper.find('[data-testid="param-chip-mode"]')
    expect(chip.classes().some((c) => c.startsWith('bg-amber'))).toBe(false)
  })

  it('renders stale_only chip when flag is true', () => {
    const wrapper = mount(JobParamsCell, {
      props: { job: makeJob({ params: { stale_only: true } }) },
    })
    expect(wrapper.find('[data-testid="param-chip-stale_only"]').text()).toBe(
      'stale only',
    )
  })

  it('does not render stale_only chip when flag is false or absent', () => {
    const wrapper = mount(JobParamsCell, {
      props: { job: makeJob({ params: { stale_only: false } }) },
    })
    expect(wrapper.find('[data-testid="param-chip-stale_only"]').exists()).toBe(
      false,
    )
  })

  it('renders source_type chip for ingestion jobs', () => {
    const wrapper = mount(JobParamsCell, {
      props: {
        job: makeJob({
          type: 'ingest_audio',
          params: { source_type: 'voice', entry_date: '2026-04-13' },
        }),
      },
    })
    expect(wrapper.find('[data-testid="param-chip-source_type"]').text()).toBe(
      'voice',
    )
    expect(wrapper.find('[data-testid="param-chip-entry_date"]').text()).toBe(
      '2026-04-13',
    )
  })

  it('renders notify_strategy chip for save_entry_pipeline', () => {
    const wrapper = mount(JobParamsCell, {
      props: {
        job: makeJob({
          type: 'save_entry_pipeline',
          params: { notify_strategy: 'all' },
        }),
      },
    })
    const chip = wrapper.find('[data-testid="param-chip-notify_strategy"]')
    expect(chip.exists()).toBe(true)
    expect(chip.text()).toContain('all')
  })

  it('renders multiple chips together for entity_extraction', () => {
    const wrapper = mount(JobParamsCell, {
      props: {
        job: makeJob({
          type: 'entity_extraction',
          params: {
            start_date: '2026-02-02',
            end_date: '2026-02-28',
            stale_only: true,
          },
        }),
      },
    })
    expect(wrapper.find('[data-testid="param-chip-date_range"]').exists()).toBe(
      true,
    )
    expect(wrapper.find('[data-testid="param-chip-stale_only"]').exists()).toBe(
      true,
    )
  })

  it('hides internal keys from chips but still exposes them via raw popover', () => {
    const wrapper = mount(JobParamsCell, {
      props: {
        job: makeJob({
          params: { entry_id: 42, user_id: 1, parent_job_id: 'p-1' },
        }),
      },
    })
    expect(wrapper.findAll('[data-testid^="param-chip-"]').length).toBe(0)
    expect(wrapper.find('[data-testid="json-popover-trigger"]').exists()).toBe(
      true,
    )
  })

  it('renders a dash when no params are recognized', () => {
    const wrapper = mount(JobParamsCell, {
      props: { job: makeJob({ params: {} }) },
    })
    expect(wrapper.find('[data-testid="job-params-empty"]').exists()).toBe(true)
  })
})
