import { describe, it, expect, vi, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useEntriesStore } from '../entries'

vi.mock('@/api/entries', () => ({
  fetchEntries: vi.fn(),
  fetchEntry: vi.fn(),
  updateEntryText: vi.fn(),
}))

import { fetchEntries, fetchEntry, updateEntryText } from '@/api/entries'
const mockFetchEntries = vi.mocked(fetchEntries)
const mockFetchEntry = vi.mocked(fetchEntry)
const mockUpdateEntryText = vi.mocked(updateEntryText)

describe('useEntriesStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  it('loadEntries populates state', async () => {
    mockFetchEntries.mockResolvedValue({
      items: [
        {
          id: 1,
          entry_date: '2026-01-01',
          source_type: 'ocr',
          page_count: 1,
          word_count: 100,
          chunk_count: 3,
          created_at: '',
        },
      ],
      total: 1,
      limit: 20,
      offset: 0,
    })

    const store = useEntriesStore()
    await store.loadEntries()

    expect(store.entries).toHaveLength(1)
    expect(store.total).toBe(1)
    expect(store.loading).toBe(false)
    expect(store.error).toBeNull()
  })

  it('loadEntries sets error on failure', async () => {
    mockFetchEntries.mockRejectedValue(new Error('Network error'))

    const store = useEntriesStore()
    await store.loadEntries()

    expect(store.entries).toHaveLength(0)
    expect(store.error).toBe('Network error')
    expect(store.loading).toBe(false)
  })

  it('loadEntry populates currentEntry', async () => {
    const entry = {
      id: 1,
      entry_date: '2026-01-01',
      source_type: 'ocr' as const,
      raw_text: 'raw',
      final_text: 'final',
      page_count: 1,
      word_count: 10,
      chunk_count: 2,
      language: 'en',
      created_at: '',
      updated_at: '',
    }
    mockFetchEntry.mockResolvedValue(entry)

    const store = useEntriesStore()
    await store.loadEntry(1)

    expect(store.currentEntry).toEqual(entry)
  })

  it('saveEntryText updates currentEntry', async () => {
    const updated = {
      id: 1,
      entry_date: '2026-01-01',
      source_type: 'ocr' as const,
      raw_text: 'raw',
      final_text: 'corrected',
      page_count: 1,
      word_count: 1,
      chunk_count: 1,
      language: 'en',
      created_at: '',
      updated_at: '',
    }
    mockUpdateEntryText.mockResolvedValue(updated)

    const store = useEntriesStore()
    await store.saveEntryText(1, 'corrected')

    expect(store.currentEntry?.final_text).toBe('corrected')
  })

  it('totalPages computes correctly', async () => {
    mockFetchEntries.mockResolvedValue({
      items: [],
      total: 45,
      limit: 20,
      offset: 0,
    })

    const store = useEntriesStore()
    await store.loadEntries()

    expect(store.totalPages).toBe(3)
  })

  it('loadEntries falls back to a generic message when a non-Error is thrown', async () => {
    mockFetchEntries.mockRejectedValue('raw string')

    const store = useEntriesStore()
    await store.loadEntries()

    expect(store.error).toBe('Failed to load entries')
  })

  it('loadEntry sets error on failure', async () => {
    mockFetchEntry.mockRejectedValue(new Error('Not found'))

    const store = useEntriesStore()
    await store.loadEntry(99)

    expect(store.currentEntry).toBeNull()
    expect(store.error).toBe('Not found')
    expect(store.loading).toBe(false)
  })

  it('loadEntry falls back to a generic message when a non-Error is thrown', async () => {
    mockFetchEntry.mockRejectedValue({ unexpected: true })

    const store = useEntriesStore()
    await store.loadEntry(1)

    expect(store.error).toBe('Failed to load entry')
  })

  it('saveEntryText sets error and rethrows on failure', async () => {
    mockUpdateEntryText.mockRejectedValue(new Error('Conflict'))

    const store = useEntriesStore()
    await expect(store.saveEntryText(1, 'new')).rejects.toThrow('Conflict')
    expect(store.error).toBe('Conflict')
    expect(store.loading).toBe(false)
  })

  it('saveEntryText falls back to a generic message when a non-Error is thrown', async () => {
    mockUpdateEntryText.mockRejectedValue('kaboom')

    const store = useEntriesStore()
    await expect(store.saveEntryText(1, 'new')).rejects.toBe('kaboom')
    expect(store.error).toBe('Failed to save entry')
  })

  it('currentPage defaults to 1 before any load', () => {
    const store = useEntriesStore()
    expect(store.currentPage).toBe(1)
  })

  it('currentPage reflects offset/limit after loadEntries', async () => {
    mockFetchEntries.mockResolvedValue({
      items: [],
      total: 100,
      limit: 20,
      offset: 40,
    })

    const store = useEntriesStore()
    await store.loadEntries({ limit: 20, offset: 40 })

    expect(store.currentPage).toBe(3)
  })

  it('hasEntries flips from false to true after a successful load', async () => {
    const store = useEntriesStore()
    expect(store.hasEntries).toBe(false)

    mockFetchEntries.mockResolvedValue({
      items: [
        {
          id: 1,
          entry_date: '2026-01-01',
          source_type: 'ocr',
          page_count: 1,
          word_count: 10,
          chunk_count: 1,
          created_at: '',
        },
      ],
      total: 1,
      limit: 20,
      offset: 0,
    })
    await store.loadEntries()

    expect(store.hasEntries).toBe(true)
  })

  it('loadEntries merges new params over currentParams', async () => {
    mockFetchEntries.mockResolvedValue({
      items: [],
      total: 0,
      limit: 20,
      offset: 0,
    })

    const store = useEntriesStore()
    await store.loadEntries({ limit: 50 })

    expect(mockFetchEntries).toHaveBeenLastCalledWith(
      expect.objectContaining({ limit: 50, offset: 0 }),
    )
    expect(store.currentParams.limit).toBe(50)
  })
})
