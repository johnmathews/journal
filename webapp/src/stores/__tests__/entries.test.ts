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
})
