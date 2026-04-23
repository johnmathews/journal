import { describe, it, expect, vi, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useEntriesStore } from '../entries'

vi.mock('@/api/entries', () => ({
  fetchEntries: vi.fn(),
  fetchEntry: vi.fn(),
  updateEntryText: vi.fn(),
  updateEntryDate: vi.fn(),
  deleteEntry: vi.fn(),
  verifyDoubts: vi.fn(),
  ingestText: vi.fn(),
  ingestFile: vi.fn(),
  ingestImages: vi.fn(),
  ingestAudio: vi.fn(),
}))

import {
  fetchEntries,
  fetchEntry,
  updateEntryText,
  updateEntryDate,
  deleteEntry,
  verifyDoubts,
  ingestText,
  ingestFile,
  ingestImages,
  ingestAudio,
} from '@/api/entries'
const mockFetchEntries = vi.mocked(fetchEntries)
const mockFetchEntry = vi.mocked(fetchEntry)
const mockUpdateEntryText = vi.mocked(updateEntryText)
const mockUpdateEntryDate = vi.mocked(updateEntryDate)
const mockDeleteEntry = vi.mocked(deleteEntry)
const mockVerifyDoubts = vi.mocked(verifyDoubts)
const mockIngestText = vi.mocked(ingestText)
const mockIngestFile = vi.mocked(ingestFile)
const mockIngestImages = vi.mocked(ingestImages)
const mockIngestAudio = vi.mocked(ingestAudio)

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
          source_type: 'photo',
          page_count: 1,
          word_count: 100,
          chunk_count: 3,
          created_at: '',
          uncertain_span_count: 0,
          doubts_verified: false,
          language: 'en',
          updated_at: '',
          entity_mention_count: 0,
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
      source_type: 'photo' as const,
      raw_text: 'raw',
      final_text: 'final',
      page_count: 1,
      word_count: 10,
      chunk_count: 2,
      language: 'en',
      created_at: '',
      uncertain_span_count: 0,
      updated_at: '',
      doubts_verified: false,
      uncertain_spans: [],
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
      source_type: 'photo' as const,
      raw_text: 'raw',
      final_text: 'corrected',
      page_count: 1,
      word_count: 1,
      chunk_count: 1,
      language: 'en',
      created_at: '',
      uncertain_span_count: 0,
      updated_at: '',
      doubts_verified: false,
      uncertain_spans: [],
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
          source_type: 'photo',
          page_count: 1,
          word_count: 10,
          chunk_count: 1,
          created_at: '',
          uncertain_span_count: 0,
          doubts_verified: false,
          language: 'en',
          updated_at: '',
          entity_mention_count: 0,
        },
      ],
      total: 1,
      limit: 20,
      offset: 0,
    })
    await store.loadEntries()

    expect(store.hasEntries).toBe(true)
  })

  // --- updateDate ---

  it('updateDate updates currentEntry on success', async () => {
    const updated = {
      id: 1,
      entry_date: '2026-02-15',
      source_type: 'photo' as const,
      raw_text: 'raw',
      final_text: 'final',
      page_count: 1,
      word_count: 10,
      chunk_count: 2,
      language: 'en',
      created_at: '',
      uncertain_span_count: 0,
      updated_at: '',
      doubts_verified: false,
      uncertain_spans: [],
    }
    mockUpdateEntryDate.mockResolvedValue(updated)

    const store = useEntriesStore()
    await store.updateDate(1, '2026-02-15')

    expect(mockUpdateEntryDate).toHaveBeenCalledWith(1, '2026-02-15')
    expect(store.currentEntry?.entry_date).toBe('2026-02-15')
    expect(store.loading).toBe(false)
    expect(store.error).toBeNull()
  })

  it('updateDate sets error and rethrows on failure', async () => {
    mockUpdateEntryDate.mockRejectedValue(new Error('Invalid date'))

    const store = useEntriesStore()
    await expect(store.updateDate(1, 'bad')).rejects.toThrow('Invalid date')
    expect(store.error).toBe('Invalid date')
    expect(store.loading).toBe(false)
  })

  it('updateDate falls back to generic message for non-Error', async () => {
    mockUpdateEntryDate.mockRejectedValue('boom')

    const store = useEntriesStore()
    await expect(store.updateDate(1, '2026-01-01')).rejects.toBe('boom')
    expect(store.error).toBe('Failed to update date')
  })

  it('deleteEntry removes the entry from the list and decrements total', async () => {
    mockFetchEntries.mockResolvedValue({
      items: [
        {
          id: 1,
          entry_date: '2026-01-01',
          source_type: 'photo',
          page_count: 1,
          word_count: 10,
          chunk_count: 1,
          created_at: '',
          uncertain_span_count: 0,
          doubts_verified: false,
          language: 'en',
          updated_at: '',
          entity_mention_count: 0,
        },
        {
          id: 2,
          entry_date: '2026-01-02',
          source_type: 'photo',
          page_count: 1,
          word_count: 20,
          chunk_count: 2,
          created_at: '',
          uncertain_span_count: 0,
          doubts_verified: false,
          language: 'en',
          updated_at: '',
          entity_mention_count: 0,
        },
      ],
      total: 2,
      limit: 20,
      offset: 0,
    })
    mockDeleteEntry.mockResolvedValue({ deleted: true, id: 1 })

    const store = useEntriesStore()
    await store.loadEntries()
    await store.deleteEntry(1)

    expect(mockDeleteEntry).toHaveBeenCalledWith(1)
    expect(store.entries.map((e) => e.id)).toEqual([2])
    expect(store.total).toBe(1)
    expect(store.error).toBeNull()
  })

  it('deleteEntry clears currentEntry when the deleted entry is loaded', async () => {
    const entry = {
      id: 42,
      entry_date: '2026-01-01',
      source_type: 'photo' as const,
      raw_text: 'raw',
      final_text: 'final',
      page_count: 1,
      word_count: 10,
      chunk_count: 2,
      language: 'en',
      created_at: '',
      uncertain_span_count: 0,
      updated_at: '',
      doubts_verified: false,
      uncertain_spans: [],
    }
    mockFetchEntry.mockResolvedValue(entry)
    mockDeleteEntry.mockResolvedValue({ deleted: true, id: 42 })

    const store = useEntriesStore()
    await store.loadEntry(42)
    expect(store.currentEntry?.id).toBe(42)

    await store.deleteEntry(42)
    expect(store.currentEntry).toBeNull()
  })

  it('deleteEntry sets error and rethrows on failure', async () => {
    mockDeleteEntry.mockRejectedValue(new Error('Not found'))

    const store = useEntriesStore()
    await expect(store.deleteEntry(99)).rejects.toThrow('Not found')
    expect(store.error).toBe('Not found')
    expect(store.loading).toBe(false)
  })

  it('deleteEntry falls back to a generic message when a non-Error is thrown', async () => {
    mockDeleteEntry.mockRejectedValue('boom')

    const store = useEntriesStore()
    await expect(store.deleteEntry(1)).rejects.toBe('boom')
    expect(store.error).toBe('Failed to delete entry')
  })

  // --- verifyDoubts ---

  it('verifyDoubts updates currentEntry with verified state', async () => {
    const verified = {
      id: 1,
      entry_date: '2026-01-01',
      source_type: 'photo' as const,
      raw_text: 'Hello Ritsya.',
      final_text: 'Hello Ritsya.',
      page_count: 1,
      word_count: 2,
      chunk_count: 1,
      language: 'en',
      created_at: '',
      updated_at: '',
      doubts_verified: true,
      uncertain_spans: [],
    }
    mockVerifyDoubts.mockResolvedValue(verified)

    const store = useEntriesStore()
    await store.verifyDoubts(1)

    expect(mockVerifyDoubts).toHaveBeenCalledWith(1)
    expect(store.currentEntry?.doubts_verified).toBe(true)
    expect(store.currentEntry?.uncertain_spans).toEqual([])
    expect(store.loading).toBe(false)
    expect(store.error).toBeNull()
  })

  it('verifyDoubts sets error and rethrows on failure', async () => {
    mockVerifyDoubts.mockRejectedValue(new Error('Not found'))

    const store = useEntriesStore()
    await expect(store.verifyDoubts(999)).rejects.toThrow('Not found')
    expect(store.error).toBe('Not found')
    expect(store.loading).toBe(false)
  })

  it('verifyDoubts falls back to generic message for non-Error', async () => {
    mockVerifyDoubts.mockRejectedValue('boom')

    const store = useEntriesStore()
    await expect(store.verifyDoubts(1)).rejects.toBe('boom')
    expect(store.error).toBe('Failed to verify doubts')
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

  // --- createTextEntry ---

  it('createTextEntry sets creating=true during call and false after', async () => {
    const entry = {
      id: 10,
      entry_date: '2026-04-12',
      source_type: 'text_entry' as const,
      raw_text: 'hello',
      final_text: 'hello',
      page_count: 1,
      word_count: 1,
      chunk_count: 1,
      language: 'en',
      created_at: '',
      uncertain_span_count: 0,
      updated_at: '',
      doubts_verified: false,
      uncertain_spans: [],
    }
    let creatingDuringCall = false
    mockIngestText.mockImplementation(() => {
      // Capture creating state mid-call via the store
      const s = useEntriesStore()
      creatingDuringCall = s.creating
      return Promise.resolve({ entry, mood_job_id: null, entity_extraction_job_id: null })
    })

    const store = useEntriesStore()
    expect(store.creating).toBe(false)

    await store.createTextEntry('hello', '2026-04-12')

    expect(creatingDuringCall).toBe(true)
    expect(store.creating).toBe(false)
    expect(store.createError).toBeNull()
  })

  it('createTextEntry returns the result from ingestText', async () => {
    const response = {
      entry: {
        id: 11,
        entry_date: '2026-04-12',
        source_type: 'text_entry' as const,
        raw_text: 'text',
        final_text: 'text',
        page_count: 1,
        word_count: 1,
        chunk_count: 1,
        language: 'en',
        created_at: '',
        uncertain_span_count: 0,
        updated_at: '',
        doubts_verified: false,
        uncertain_spans: [],
      },
      mood_job_id: 'mood-1',
      entity_extraction_job_id: null,
    }
    mockIngestText.mockResolvedValue(response)

    const store = useEntriesStore()
    const result = await store.createTextEntry('text', '2026-04-12')

    expect(result).toEqual(response)
    expect(mockIngestText).toHaveBeenCalledWith({
      text: 'text',
      entry_date: '2026-04-12',
    })
  })

  it('createTextEntry sets createError on failure', async () => {
    mockIngestText.mockRejectedValue(new Error('Server error'))

    const store = useEntriesStore()
    await expect(store.createTextEntry('text')).rejects.toThrow('Server error')
    expect(store.createError).toBe('Server error')
    expect(store.creating).toBe(false)
  })

  it('createTextEntry falls back to generic message for non-Error', async () => {
    mockIngestText.mockRejectedValue('unexpected')

    const store = useEntriesStore()
    await expect(store.createTextEntry('text')).rejects.toBe('unexpected')
    expect(store.createError).toBe('Failed to create entry')
  })

  // --- importFile ---

  it('importFile calls the right API function', async () => {
    const response = {
      entry: {
        id: 12,
        entry_date: '2026-04-12',
        source_type: 'imported_text_file' as const,
        raw_text: 'imported',
        final_text: 'imported',
        page_count: 1,
        word_count: 1,
        chunk_count: 1,
        language: 'en',
        created_at: '',
        uncertain_span_count: 0,
        updated_at: '',
        doubts_verified: false,
        uncertain_spans: [],
      },
      mood_job_id: null,
      entity_extraction_job_id: null,
    }
    mockIngestFile.mockResolvedValue(response)

    const store = useEntriesStore()
    const file = new File(['content'], 'test.md', { type: 'text/markdown' })
    const result = await store.importFile(file, '2026-04-12')

    expect(result).toEqual(response)
    expect(mockIngestFile).toHaveBeenCalledWith(file, '2026-04-12')
    expect(store.creating).toBe(false)
    expect(store.createError).toBeNull()
  })

  it('importFile sets createError on failure', async () => {
    mockIngestFile.mockRejectedValue(new Error('Bad file'))

    const store = useEntriesStore()
    const file = new File(['x'], 'bad.txt', { type: 'text/plain' })
    await expect(store.importFile(file)).rejects.toThrow('Bad file')
    expect(store.createError).toBe('Bad file')
    expect(store.creating).toBe(false)
  })

  it('importFile falls back to generic message for non-Error', async () => {
    mockIngestFile.mockRejectedValue(42)

    const store = useEntriesStore()
    const file = new File(['x'], 'file.txt', { type: 'text/plain' })
    await expect(store.importFile(file)).rejects.toBe(42)
    expect(store.createError).toBe('Failed to import file')
  })

  // --- uploadImages ---

  it('uploadImages returns job_id', async () => {
    mockIngestImages.mockResolvedValue({
      job_id: 'job-abc',
      status: 'queued',
    })

    const store = useEntriesStore()
    const files = [new File(['img'], 'page.jpg', { type: 'image/jpeg' })]
    const result = await store.uploadImages(files, '2026-04-12')

    expect(result.job_id).toBe('job-abc')
    expect(result.status).toBe('queued')
    expect(mockIngestImages).toHaveBeenCalledWith(files, '2026-04-12')
    expect(store.creating).toBe(false)
    expect(store.createError).toBeNull()
  })

  it('uploadImages sets createError on failure', async () => {
    mockIngestImages.mockRejectedValue(new Error('Upload failed'))

    const store = useEntriesStore()
    const files = [new File(['img'], 'page.jpg', { type: 'image/jpeg' })]
    await expect(store.uploadImages(files)).rejects.toThrow('Upload failed')
    expect(store.createError).toBe('Upload failed')
    expect(store.creating).toBe(false)
  })

  it('uploadImages falls back to generic message for non-Error', async () => {
    mockIngestImages.mockRejectedValue({ code: 500 })

    const store = useEntriesStore()
    const files = [new File(['img'], 'page.jpg', { type: 'image/jpeg' })]
    await expect(store.uploadImages(files)).rejects.toEqual({ code: 500 })
    expect(store.createError).toBe('Failed to upload images')
  })

  // --- uploadAudio ---

  it('uploadAudio returns job_id', async () => {
    mockIngestAudio.mockResolvedValue({
      job_id: 'audio-job-1',
      status: 'queued',
    })

    const store = useEntriesStore()
    const blobs = [new Blob(['audio'], { type: 'audio/webm' })]
    const result = await store.uploadAudio(blobs, '2026-04-14')

    expect(result.job_id).toBe('audio-job-1')
    expect(result.status).toBe('queued')
    expect(mockIngestAudio).toHaveBeenCalledWith(blobs, '2026-04-14')
    expect(store.creating).toBe(false)
    expect(store.createError).toBeNull()
  })

  it('uploadAudio sets createError on failure', async () => {
    mockIngestAudio.mockRejectedValue(new Error('Transcription failed'))

    const store = useEntriesStore()
    const blobs = [new Blob(['audio'], { type: 'audio/webm' })]
    await expect(store.uploadAudio(blobs)).rejects.toThrow(
      'Transcription failed',
    )
    expect(store.createError).toBe('Transcription failed')
    expect(store.creating).toBe(false)
  })

  it('uploadAudio falls back to generic message for non-Error', async () => {
    mockIngestAudio.mockRejectedValue({ code: 500 })

    const store = useEntriesStore()
    const blobs = [new Blob(['audio'], { type: 'audio/webm' })]
    await expect(store.uploadAudio(blobs)).rejects.toEqual({ code: 500 })
    expect(store.createError).toBe('Failed to upload recordings')
  })
})
