import { describe, it, expect, vi, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useStorylinesStore } from '../storylines'

vi.mock('@/api/storylines', () => ({
  fetchStorylines: vi.fn(),
  fetchStoryline: vi.fn(),
  createStoryline: vi.fn(),
  regenerateStoryline: vi.fn(),
  deleteStoryline: vi.fn(),
}))

import {
  createStoryline,
  deleteStoryline,
  fetchStoryline,
  fetchStorylines,
  regenerateStoryline,
} from '@/api/storylines'

const mockFetchStorylines = vi.mocked(fetchStorylines)
const mockFetchStoryline = vi.mocked(fetchStoryline)
const mockCreateStoryline = vi.mocked(createStoryline)
const mockRegenerateStoryline = vi.mocked(regenerateStoryline)
const mockDeleteStoryline = vi.mocked(deleteStoryline)

function mockSummary(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 1,
    user_id: 1,
    entity_id: 100,
    name: 'Running',
    description: '',
    start_date: null,
    end_date: null,
    status: 'active',
    last_generated_at: '2026-05-12T10:00:00Z',
    last_extension_check_at: null,
    created_at: '2026-05-10T00:00:00Z',
    updated_at: '2026-05-12T10:00:00Z',
    ...overrides,
  }
}

describe('useStorylinesStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  it('loadStorylines populates state', async () => {
    mockFetchStorylines.mockResolvedValue({
      items: [mockSummary({ id: 1 }), mockSummary({ id: 2, name: 'Atlas' })],
      total: 2,
      limit: 20,
      offset: 0,
    })

    const store = useStorylinesStore()
    await store.loadStorylines()

    expect(store.storylines).toHaveLength(2)
    expect(store.total).toBe(2)
    expect(store.loading).toBe(false)
    expect(store.error).toBeNull()
    expect(store.hasStorylines).toBe(true)
  })

  it('loadStorylines sets error on Error rejection', async () => {
    mockFetchStorylines.mockRejectedValue(new Error('boom'))
    const store = useStorylinesStore()
    await store.loadStorylines()
    expect(store.error).toBe('boom')
    expect(store.loading).toBe(false)
  })

  it('loadStorylines falls back to a generic message for non-Error rejects', async () => {
    mockFetchStorylines.mockRejectedValue('nope')
    const store = useStorylinesStore()
    await store.loadStorylines()
    expect(store.error).toBe('Failed to load storylines')
  })

  it('loadStorylines merges new params over currentParams', async () => {
    mockFetchStorylines.mockResolvedValue({
      items: [],
      total: 0,
      limit: 50,
      offset: 0,
    })
    const store = useStorylinesStore()
    await store.loadStorylines({ limit: 50 })
    expect(mockFetchStorylines).toHaveBeenLastCalledWith(
      expect.objectContaining({ limit: 50, offset: 0 }),
    )
  })

  it('totalPages computes against currentParams.limit', async () => {
    mockFetchStorylines.mockResolvedValue({
      items: [],
      total: 45,
      limit: 20,
      offset: 0,
    })
    const store = useStorylinesStore()
    await store.loadStorylines()
    expect(store.totalPages).toBe(3)
  })

  it('currentPage reflects offset/limit after load', async () => {
    mockFetchStorylines.mockResolvedValue({
      items: [],
      total: 100,
      limit: 20,
      offset: 40,
    })
    const store = useStorylinesStore()
    await store.loadStorylines({ limit: 20, offset: 40 })
    expect(store.currentPage).toBe(3)
  })

  it('currentPage defaults to 1 before any load', () => {
    const store = useStorylinesStore()
    expect(store.currentPage).toBe(1)
  })

  it('loadStoryline populates currentStoryline and toggles detailLoading', async () => {
    let observedDuringFetch = false
    mockFetchStoryline.mockImplementation(() => {
      const s = useStorylinesStore()
      observedDuringFetch = s.detailLoading
      return Promise.resolve({
        ...mockSummary({ id: 5 }),
        panels: {
          curation: {
            panel_kind: 'curation' as const,
            segments: [{ kind: 'text' as const, text: 'a' }],
            source_entry_ids: [],
            citation_count: 0,
            model_used: null,
            generated_at: null,
          },
        },
      })
    })
    const store = useStorylinesStore()
    await store.loadStoryline(5)
    expect(observedDuringFetch).toBe(true)
    expect(store.currentStoryline?.id).toBe(5)
    expect(store.detailLoading).toBe(false)
    expect(store.loading).toBe(false)
  })

  it('loadStoryline sets error on failure', async () => {
    mockFetchStoryline.mockRejectedValue(new Error('not found'))
    const store = useStorylinesStore()
    await store.loadStoryline(99)
    expect(store.currentStoryline).toBeNull()
    expect(store.error).toBe('not found')
    expect(store.detailLoading).toBe(false)
  })

  it('loadStoryline falls back to generic message for non-Error', async () => {
    mockFetchStoryline.mockRejectedValue('boom')
    const store = useStorylinesStore()
    await store.loadStoryline(1)
    expect(store.error).toBe('Failed to load storyline')
  })

  it('clearCurrent nulls currentStoryline', async () => {
    mockFetchStoryline.mockResolvedValue({
      ...mockSummary({ id: 1 }),
      panels: {},
    })
    const store = useStorylinesStore()
    await store.loadStoryline(1)
    expect(store.currentStoryline).not.toBeNull()
    store.clearCurrent()
    expect(store.currentStoryline).toBeNull()
  })

  it('createStoryline returns the response and resets the creating flag', async () => {
    mockCreateStoryline.mockResolvedValue({
      id: 10,
      user_id: 1,
      entity_id: 200,
      name: 'New',
      description: '',
      status: 'active',
      created_at: '2026-05-12T00:00:00Z',
    })
    const store = useStorylinesStore()
    const resp = await store.createStoryline({ entity_id: 200, name: 'New' })
    expect(resp.id).toBe(10)
    expect(store.creating).toBe(false)
    expect(store.createError).toBeNull()
  })

  it('createStoryline records createError on Error rejection and rethrows', async () => {
    mockCreateStoryline.mockRejectedValue(new Error('conflict'))
    const store = useStorylinesStore()
    await expect(
      store.createStoryline({ entity_id: 1, name: 'X' }),
    ).rejects.toThrow('conflict')
    expect(store.createError).toBe('conflict')
    expect(store.creating).toBe(false)
  })

  it('createStoryline falls back to generic message for non-Error', async () => {
    mockCreateStoryline.mockRejectedValue('boom')
    const store = useStorylinesStore()
    await expect(
      store.createStoryline({ entity_id: 1, name: 'X' }),
    ).rejects.toBe('boom')
    expect(store.createError).toBe('Failed to create storyline')
  })

  it('regenerate returns the job id', async () => {
    mockRegenerateStoryline.mockResolvedValue({
      job_id: 'job-1',
      status: 'queued',
    })
    const store = useStorylinesStore()
    const resp = await store.regenerate(1)
    expect(resp.job_id).toBe('job-1')
    expect(store.regenerating).toBe(false)
    expect(store.regenerateError).toBeNull()
  })

  it('regenerate records regenerateError on Error rejection and rethrows', async () => {
    mockRegenerateStoryline.mockRejectedValue(new Error('service down'))
    const store = useStorylinesStore()
    await expect(store.regenerate(1)).rejects.toThrow('service down')
    expect(store.regenerateError).toBe('service down')
    expect(store.regenerating).toBe(false)
  })

  it('regenerate falls back to a generic message for non-Error', async () => {
    mockRegenerateStoryline.mockRejectedValue('boom')
    const store = useStorylinesStore()
    await expect(store.regenerate(1)).rejects.toBe('boom')
    expect(store.regenerateError).toBe('Failed to queue regeneration')
  })

  it('removeStoryline drops the row from the list and decrements total', async () => {
    mockFetchStorylines.mockResolvedValue({
      items: [mockSummary({ id: 1 }), mockSummary({ id: 2 })],
      total: 2,
      limit: 20,
      offset: 0,
    })
    mockDeleteStoryline.mockResolvedValue({ deleted: true })
    const store = useStorylinesStore()
    await store.loadStorylines()
    await store.removeStoryline(1)
    expect(store.storylines.map((s) => s.id)).toEqual([2])
    expect(store.total).toBe(1)
  })

  it('removeStoryline clears currentStoryline when the deleted one is loaded', async () => {
    mockFetchStoryline.mockResolvedValue({
      ...mockSummary({ id: 42 }),
      panels: {},
    })
    mockDeleteStoryline.mockResolvedValue({ deleted: true })
    const store = useStorylinesStore()
    await store.loadStoryline(42)
    await store.removeStoryline(42)
    expect(store.currentStoryline).toBeNull()
  })

  it('removeStoryline sets error on Error rejection and rethrows', async () => {
    mockDeleteStoryline.mockRejectedValue(new Error('forbidden'))
    const store = useStorylinesStore()
    await expect(store.removeStoryline(1)).rejects.toThrow('forbidden')
    expect(store.error).toBe('forbidden')
  })

  it('removeStoryline falls back to a generic message for non-Error', async () => {
    mockDeleteStoryline.mockRejectedValue('boom')
    const store = useStorylinesStore()
    await expect(store.removeStoryline(1)).rejects.toBe('boom')
    expect(store.error).toBe('Failed to delete storyline')
  })
})
