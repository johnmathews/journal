import { describe, it, expect, vi, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useStorylinesStore } from '../storylines'

vi.mock('@/api/storylines', () => ({
  fetchStorylines: vi.fn(),
  fetchStoryline: vi.fn(),
  createStoryline: vi.fn(),
  regenerateStoryline: vi.fn(),
  deleteStoryline: vi.fn(),
  setStorylineAnchors: vi.fn(),
  updateStoryline: vi.fn(),
}))

import {
  createStoryline,
  deleteStoryline,
  fetchStoryline,
  fetchStorylines,
  regenerateStoryline,
  setStorylineAnchors,
  updateStoryline,
} from '@/api/storylines'

const mockFetchStorylines = vi.mocked(fetchStorylines)
const mockFetchStoryline = vi.mocked(fetchStoryline)
const mockCreateStoryline = vi.mocked(createStoryline)
const mockRegenerateStoryline = vi.mocked(regenerateStoryline)
const mockDeleteStoryline = vi.mocked(deleteStoryline)
const mockSetStorylineAnchors = vi.mocked(setStorylineAnchors)
const mockUpdateStoryline = vi.mocked(updateStoryline)

function mockSummary(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 1,
    user_id: 1,
    anchors: [{ id: 100, canonical_name: 'Running' }],
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
      anchors: [{ id: 200, canonical_name: 'New' }],
      name: 'New',
      description: '',
      status: 'active',
      created_at: '2026-05-12T00:00:00Z',
    })
    const store = useStorylinesStore()
    const resp = await store.createStoryline({
      entity_ids: [200],
      name: 'New',
    })
    expect(resp.id).toBe(10)
    expect(store.creating).toBe(false)
    expect(store.createError).toBeNull()
  })

  it('createStoryline records createError on Error rejection and rethrows', async () => {
    mockCreateStoryline.mockRejectedValue(new Error('conflict'))
    const store = useStorylinesStore()
    await expect(
      store.createStoryline({ entity_ids: [1], name: 'X' }),
    ).rejects.toThrow('conflict')
    expect(store.createError).toBe('conflict')
    expect(store.creating).toBe(false)
  })

  it('createStoryline falls back to generic message for non-Error', async () => {
    mockCreateStoryline.mockRejectedValue('boom')
    const store = useStorylinesStore()
    await expect(
      store.createStoryline({ entity_ids: [1], name: 'X' }),
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

  it('regenerate forwards the optional body to the API client', async () => {
    mockRegenerateStoryline.mockResolvedValue({
      job_id: 'job-2',
      status: 'queued',
    })
    const store = useStorylinesStore()
    await store.regenerate(7, {
      mode: 'append',
      start_date: '2026-04-01',
      end_date: '2026-05-01',
    })
    expect(mockRegenerateStoryline).toHaveBeenCalledWith(7, {
      mode: 'append',
      start_date: '2026-04-01',
      end_date: '2026-05-01',
    })
  })

  it('regenerate with no body forwards undefined to the API client', async () => {
    mockRegenerateStoryline.mockResolvedValue({
      job_id: 'job-3',
      status: 'queued',
    })
    const store = useStorylinesStore()
    await store.regenerate(8)
    expect(mockRegenerateStoryline).toHaveBeenCalledWith(8, undefined)
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

  it('setAnchors calls the API with entity_ids and returns the response', async () => {
    mockSetStorylineAnchors.mockResolvedValue({
      id: 1,
      anchors: [
        { id: 100, canonical_name: 'Running' },
        { id: 200, canonical_name: 'Vienna' },
      ],
    })
    const store = useStorylinesStore()
    const resp = await store.setAnchors(1, [200, 100])
    expect(mockSetStorylineAnchors).toHaveBeenCalledWith(1, {
      entity_ids: [200, 100],
    })
    expect(resp.anchors).toHaveLength(2)
    expect(store.savingAnchors).toBe(false)
    expect(store.anchorsError).toBeNull()
  })

  it('setAnchors toggles savingAnchors while in flight', async () => {
    let observedDuringSave = false
    mockSetStorylineAnchors.mockImplementation(() => {
      const s = useStorylinesStore()
      observedDuringSave = s.savingAnchors
      return Promise.resolve({ id: 1, anchors: [] })
    })
    const store = useStorylinesStore()
    await store.setAnchors(1, [5])
    expect(observedDuringSave).toBe(true)
    expect(store.savingAnchors).toBe(false)
  })

  it('setAnchors refreshes currentStoryline.anchors from the server response', async () => {
    mockFetchStoryline.mockResolvedValue({
      ...mockSummary({ id: 7 }),
      panels: {},
    })
    // Server response is authoritative: deduped, ascending id order.
    mockSetStorylineAnchors.mockResolvedValue({
      id: 7,
      anchors: [
        { id: 100, canonical_name: 'Running' },
        { id: 300, canonical_name: 'Atlas' },
      ],
    })
    const store = useStorylinesStore()
    await store.loadStoryline(7)
    await store.setAnchors(7, [300, 100])
    expect(store.currentStoryline?.anchors.map((a) => a.id)).toEqual([100, 300])
  })

  it('setAnchors leaves currentStoryline alone when a different storyline is loaded', async () => {
    mockFetchStoryline.mockResolvedValue({
      ...mockSummary({ id: 9 }),
      panels: {},
    })
    mockSetStorylineAnchors.mockResolvedValue({
      id: 1,
      anchors: [{ id: 555, canonical_name: 'Other' }],
    })
    const store = useStorylinesStore()
    await store.loadStoryline(9)
    await store.setAnchors(1, [555])
    expect(store.currentStoryline?.anchors.map((a) => a.id)).toEqual([100])
  })

  it('setAnchors refreshes the matching list row', async () => {
    mockFetchStorylines.mockResolvedValue({
      items: [mockSummary({ id: 1 }), mockSummary({ id: 2 })],
      total: 2,
      limit: 20,
      offset: 0,
    })
    mockSetStorylineAnchors.mockResolvedValue({
      id: 2,
      anchors: [{ id: 999, canonical_name: 'Swapped' }],
    })
    const store = useStorylinesStore()
    await store.loadStorylines()
    await store.setAnchors(2, [999])
    expect(store.storylines[1].anchors.map((a) => a.id)).toEqual([999])
    // Untouched row keeps its original anchors.
    expect(store.storylines[0].anchors.map((a) => a.id)).toEqual([100])
  })

  it('setAnchors records anchorsError on Error rejection and rethrows', async () => {
    mockSetStorylineAnchors.mockRejectedValue(new Error('cap exceeded'))
    const store = useStorylinesStore()
    await expect(store.setAnchors(1, [1, 2])).rejects.toThrow('cap exceeded')
    expect(store.anchorsError).toBe('cap exceeded')
    expect(store.savingAnchors).toBe(false)
  })

  it('setAnchors falls back to a generic message for non-Error', async () => {
    mockSetStorylineAnchors.mockRejectedValue('boom')
    const store = useStorylinesStore()
    await expect(store.setAnchors(1, [1])).rejects.toBe('boom')
    expect(store.anchorsError).toBe('Failed to update anchors')
  })

  it('renameStoryline calls the API and refreshes currentStoryline.name', async () => {
    mockFetchStoryline.mockResolvedValue({
      ...mockSummary({ id: 7, name: 'Old' }),
      panels: {},
    })
    mockUpdateStoryline.mockResolvedValue({
      ...mockSummary({ id: 7, name: 'New title' }),
    })
    const store = useStorylinesStore()
    await store.loadStoryline(7)
    await store.renameStoryline(7, 'New title')
    expect(mockUpdateStoryline).toHaveBeenCalledWith(7, { name: 'New title' })
    expect(store.currentStoryline?.name).toBe('New title')
  })

  it('renameStoryline leaves currentStoryline alone for a different id', async () => {
    mockFetchStoryline.mockResolvedValue({
      ...mockSummary({ id: 9, name: 'Nine' }),
      panels: {},
    })
    mockUpdateStoryline.mockResolvedValue({
      ...mockSummary({ id: 1, name: 'Renamed One' }),
    })
    const store = useStorylinesStore()
    await store.loadStoryline(9)
    await store.renameStoryline(1, 'Renamed One')
    expect(store.currentStoryline?.name).toBe('Nine')
  })

  it('renameStoryline refreshes the matching list row', async () => {
    mockFetchStorylines.mockResolvedValue({
      items: [
        mockSummary({ id: 1, name: 'One' }),
        mockSummary({ id: 2, name: 'Two' }),
      ],
      total: 2,
      limit: 20,
      offset: 0,
    })
    mockUpdateStoryline.mockResolvedValue({
      ...mockSummary({ id: 2, name: 'Two renamed' }),
    })
    const store = useStorylinesStore()
    await store.loadStorylines()
    await store.renameStoryline(2, 'Two renamed')
    expect(store.storylines[1].name).toBe('Two renamed')
    expect(store.storylines[0].name).toBe('One')
  })

  it('renameStoryline toggles savingName while in flight', async () => {
    mockUpdateStoryline.mockResolvedValue({
      ...mockSummary({ id: 1, name: 'X' }),
    })
    const store = useStorylinesStore()
    expect(store.savingName).toBe(false)
    const p = store.renameStoryline(1, 'X')
    expect(store.savingName).toBe(true)
    await p
    expect(store.savingName).toBe(false)
  })

  it('renameStoryline records nameError on Error rejection and rethrows', async () => {
    mockUpdateStoryline.mockRejectedValue(new Error('name required'))
    const store = useStorylinesStore()
    await expect(store.renameStoryline(1, '')).rejects.toThrow('name required')
    expect(store.nameError).toBe('name required')
    expect(store.savingName).toBe(false)
  })

  it('renameStoryline falls back to a generic message for non-Error', async () => {
    mockUpdateStoryline.mockRejectedValue('boom')
    const store = useStorylinesStore()
    await expect(store.renameStoryline(1, 'X')).rejects.toBe('boom')
    expect(store.nameError).toBe('Failed to rename storyline')
  })
})
