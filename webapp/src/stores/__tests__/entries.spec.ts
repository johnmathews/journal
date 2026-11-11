/**
 * TDD spec for saveEntryBoundary store action.
 *
 * These tests were written BEFORE the implementation to drive out the
 * saveEntryBoundary action in src/stores/entries.ts.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useEntriesStore } from '../entries'
import * as api from '@/api/entries'

vi.mock('@/api/entries', () => ({
  fetchEntries: vi.fn(),
  fetchEntry: vi.fn(),
  updateEntryText: vi.fn(),
  updateEntryBoundary: vi.fn(),
  updateEntryDate: vi.fn(),
  deleteEntry: vi.fn(),
  verifyDoubts: vi.fn(),
  ingestText: vi.fn(),
  ingestFile: vi.fn(),
  ingestImages: vi.fn(),
  ingestAudio: vi.fn(),
}))

/** Minimal EntryDetail shape shared by mocks */
function makeEntry(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    entry_date: '2026-01-01',
    source_type: 'photo' as const,
    raw_text: 'raw',
    final_text: 'final',
    page_count: 1,
    word_count: 10,
    chunk_count: 2,
    language: 'en',
    created_at: '',
    updated_at: '',
    doubts_verified: false,
    uncertain_spans: [],
    content_boundary: null,
    ...overrides,
  }
}

describe('useEntriesStore — saveEntryBoundary', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  it('PATCHes and updates currentEntry', async () => {
    vi.spyOn(api, 'updateEntryBoundary').mockResolvedValue(
      makeEntry({
        content_boundary: { char_start: 5, char_end: 9 },
        reprocess_job_id: 'r1',
      }) as never,
    )
    const store = useEntriesStore()
    const res = await store.saveEntryBoundary(1, 5, 9)
    expect(store.currentEntry?.content_boundary).toEqual({
      char_start: 5,
      char_end: 9,
    })
    expect(res.reprocessJobId).toBe('r1')
  })

  it('returns all three job ids correctly', async () => {
    vi.spyOn(api, 'updateEntryBoundary').mockResolvedValue(
      makeEntry({
        entity_extraction_job_id: 'e1',
        reprocess_job_id: 'r1',
        mood_job_id: 'm1',
      }) as never,
    )
    const store = useEntriesStore()
    const res = await store.saveEntryBoundary(1, 0, 100)
    expect(res.extractionJobId).toBe('e1')
    expect(res.reprocessJobId).toBe('r1')
    expect(res.moodJobId).toBe('m1')
  })

  it('returns undefined job ids when none are present', async () => {
    vi.spyOn(api, 'updateEntryBoundary').mockResolvedValue(
      makeEntry({ content_boundary: null }) as never,
    )
    const store = useEntriesStore()
    const res = await store.saveEntryBoundary(1, null, null)
    expect(res.extractionJobId).toBeUndefined()
    expect(res.reprocessJobId).toBeUndefined()
    expect(res.moodJobId).toBeUndefined()
  })

  it('calls updateEntryBoundary with the correct arguments', async () => {
    const spy = vi
      .spyOn(api, 'updateEntryBoundary')
      .mockResolvedValue(makeEntry() as never)
    const store = useEntriesStore()
    await store.saveEntryBoundary(42, 10, 200)
    expect(spy).toHaveBeenCalledWith(42, 10, 200)
  })

  it('supports null start/end (reset to full page)', async () => {
    const spy = vi
      .spyOn(api, 'updateEntryBoundary')
      .mockResolvedValue(makeEntry({ content_boundary: null }) as never)
    const store = useEntriesStore()
    await store.saveEntryBoundary(1, null, null)
    expect(spy).toHaveBeenCalledWith(1, null, null)
    expect(store.currentEntry?.content_boundary).toBeNull()
  })

  it('sets loading to true during the call and false after', async () => {
    let loadingDuringCall = false
    vi.spyOn(api, 'updateEntryBoundary').mockImplementation(async () => {
      const store = useEntriesStore()
      loadingDuringCall = store.loading
      return makeEntry() as never
    })
    const store = useEntriesStore()
    expect(store.loading).toBe(false)
    await store.saveEntryBoundary(1, 0, 100)
    expect(loadingDuringCall).toBe(true)
    expect(store.loading).toBe(false)
  })

  it('clears error before the call', async () => {
    vi.spyOn(api, 'updateEntryBoundary').mockResolvedValue(makeEntry() as never)
    const store = useEntriesStore()
    store.error = 'stale error'
    await store.saveEntryBoundary(1, 0, 100)
    expect(store.error).toBeNull()
  })

  it('sets error.value and rethrows on failure', async () => {
    vi.spyOn(api, 'updateEntryBoundary').mockRejectedValue(
      new Error('Save failed'),
    )
    const store = useEntriesStore()
    await expect(store.saveEntryBoundary(1, 0, 100)).rejects.toThrow(
      'Save failed',
    )
    expect(store.error).toBe('Save failed')
    expect(store.loading).toBe(false)
  })

  it('falls back to a generic message when a non-Error is thrown', async () => {
    vi.spyOn(api, 'updateEntryBoundary').mockRejectedValue('kaboom')
    const store = useEntriesStore()
    await expect(store.saveEntryBoundary(1, 0, 100)).rejects.toBe('kaboom')
    expect(store.error).toBe('Failed to save boundary')
  })
})
