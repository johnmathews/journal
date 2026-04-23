import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  fetchEntries,
  fetchEntry,
  fetchEntryChunks,
  fetchEntryTokens,
  updateEntryText,
  deleteEntry,
  fetchStats,
  ingestText,
  ingestAudio,
} from '../entries'

vi.mock('../client', () => ({
  apiFetch: vi.fn(),
  ApiRequestError: class extends Error {
    constructor(
      public status: number,
      public errorCode: string,
      message: string,
    ) {
      super(message)
    }
  },
}))

import { apiFetch } from '../client'
const mockApiFetch = vi.mocked(apiFetch)

describe('entries API', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('fetchEntries calls correct endpoint with params', async () => {
    mockApiFetch.mockResolvedValue({
      items: [],
      total: 0,
      limit: 20,
      offset: 0,
    })
    await fetchEntries({ limit: 10, offset: 20, start_date: '2026-01-01' })
    expect(mockApiFetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/entries?'),
    )
    const url = mockApiFetch.mock.calls[0][0]
    expect(url).toContain('limit=10')
    expect(url).toContain('offset=20')
    expect(url).toContain('start_date=2026-01-01')
  })

  it('fetchEntries with no params calls base endpoint', async () => {
    mockApiFetch.mockResolvedValue({
      items: [],
      total: 0,
      limit: 20,
      offset: 0,
    })
    await fetchEntries()
    expect(mockApiFetch).toHaveBeenCalledWith('/api/entries')
  })

  it('fetchEntry calls correct endpoint', async () => {
    const entry = {
      id: 1,
      entry_date: '2026-01-01',
      raw_text: 'text',
      final_text: 'text',
    }
    mockApiFetch.mockResolvedValue(entry)
    const result = await fetchEntry(1)
    expect(mockApiFetch).toHaveBeenCalledWith('/api/entries/1')
    expect(result).toEqual(entry)
  })

  it('updateEntryText sends PATCH with body', async () => {
    const updated = { id: 1, final_text: 'corrected' }
    mockApiFetch.mockResolvedValue(updated)
    await updateEntryText(1, 'corrected')
    expect(mockApiFetch).toHaveBeenCalledWith('/api/entries/1', {
      method: 'PATCH',
      body: JSON.stringify({ final_text: 'corrected' }),
    })
  })

  it('deleteEntry sends DELETE to the entry endpoint', async () => {
    mockApiFetch.mockResolvedValue({ deleted: true, id: 7 })
    const result = await deleteEntry(7)
    expect(mockApiFetch).toHaveBeenCalledWith('/api/entries/7', {
      method: 'DELETE',
    })
    expect(result).toEqual({ deleted: true, id: 7 })
  })

  it('fetchStats calls correct endpoint', async () => {
    mockApiFetch.mockResolvedValue({ total_entries: 10 })
    await fetchStats({ start_date: '2026-01-01' })
    expect(mockApiFetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/stats?'),
    )
  })

  it('fetchEntryChunks calls correct endpoint', async () => {
    mockApiFetch.mockResolvedValue({ chunks: [] })
    await fetchEntryChunks(5)
    expect(mockApiFetch).toHaveBeenCalledWith('/api/entries/5/chunks')
  })

  it('fetchEntryTokens calls correct endpoint', async () => {
    mockApiFetch.mockResolvedValue({ tokens: [] })
    await fetchEntryTokens(3)
    expect(mockApiFetch).toHaveBeenCalledWith('/api/entries/3/tokens')
  })

  it('ingestText sends POST with body', async () => {
    mockApiFetch.mockResolvedValue({ entry_id: 1 })
    await ingestText({ text: 'hello', entry_date: '2026-01-01' })
    expect(mockApiFetch).toHaveBeenCalledWith('/api/entries/ingest/text', {
      method: 'POST',
      body: JSON.stringify({ text: 'hello', entry_date: '2026-01-01' }),
    })
  })

  it('ingestAudio sends FormData with recordings', async () => {
    mockApiFetch.mockResolvedValue({ job_id: 'j1', status: 'queued' })
    const blob = new Blob(['audio'], { type: 'audio/webm' })
    await ingestAudio([blob], '2026-04-01')
    expect(mockApiFetch).toHaveBeenCalledWith(
      '/api/entries/ingest/audio',
      expect.objectContaining({ method: 'POST' }),
    )
    const body = mockApiFetch.mock.calls[0][1]?.body as FormData
    expect(body.get('entry_date')).toBe('2026-04-01')
    expect(body.get('audio')).toBeTruthy()
  })

  it('ingestAudio works without entryDate', async () => {
    mockApiFetch.mockResolvedValue({ job_id: 'j2', status: 'queued' })
    const blob = new Blob(['audio'], { type: 'audio/mp4' })
    await ingestAudio([blob])
    const body = mockApiFetch.mock.calls[0][1]?.body as FormData
    expect(body.get('entry_date')).toBeNull()
  })
})
