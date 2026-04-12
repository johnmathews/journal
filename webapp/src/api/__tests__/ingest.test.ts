import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ingestText, ingestFile, ingestImages } from '../entries'

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

describe('ingest API', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('ingestText', () => {
    it('sends POST with JSON body', async () => {
      const mockResponse = {
        entry: { id: 1, source_type: 'manual' },
        mood_job_id: null,
      }
      mockApiFetch.mockResolvedValue(mockResponse)

      const result = await ingestText({ text: 'Hello world' })

      expect(mockApiFetch).toHaveBeenCalledWith('/api/entries/ingest/text', {
        method: 'POST',
        body: JSON.stringify({ text: 'Hello world' }),
      })
      expect(result).toEqual(mockResponse)
    })

    it('includes entry_date when provided', async () => {
      mockApiFetch.mockResolvedValue({ entry: {}, mood_job_id: null })

      await ingestText({ text: 'Test', entry_date: '2026-01-15' })

      expect(mockApiFetch).toHaveBeenCalledWith('/api/entries/ingest/text', {
        method: 'POST',
        body: JSON.stringify({ text: 'Test', entry_date: '2026-01-15' }),
      })
    })
  })

  describe('ingestFile', () => {
    it('sends FormData with file', async () => {
      mockApiFetch.mockResolvedValue({ entry: {}, mood_job_id: null })
      const file = new File(['hello'], 'test.txt', { type: 'text/plain' })

      await ingestFile(file)

      expect(mockApiFetch).toHaveBeenCalledTimes(1)
      const [path, options] = mockApiFetch.mock.calls[0]!
      expect(path).toBe('/api/entries/ingest/file')
      expect(options!.method).toBe('POST')
      expect(options!.body).toBeInstanceOf(FormData)
      expect(options!.headers).toEqual({})
    })

    it('includes entry_date in FormData', async () => {
      mockApiFetch.mockResolvedValue({ entry: {}, mood_job_id: null })
      const file = new File(['hello'], 'test.txt', { type: 'text/plain' })

      await ingestFile(file, '2026-03-01')

      const formData = mockApiFetch.mock.calls[0]![1]!.body as FormData
      expect(formData.get('entry_date')).toBe('2026-03-01')
    })

    it('omits entry_date from FormData when not provided', async () => {
      mockApiFetch.mockResolvedValue({ entry: {}, mood_job_id: null })
      const file = new File(['hello'], 'test.txt', { type: 'text/plain' })

      await ingestFile(file)

      const formData = mockApiFetch.mock.calls[0]![1]!.body as FormData
      expect(formData.get('entry_date')).toBeNull()
    })

    it('appends the file under the "file" key', async () => {
      mockApiFetch.mockResolvedValue({ entry: {}, mood_job_id: null })
      const file = new File(['content'], 'journal.md', {
        type: 'text/markdown',
      })

      await ingestFile(file)

      const formData = mockApiFetch.mock.calls[0]![1]!.body as FormData
      expect(formData.get('file')).toBeInstanceOf(File)
    })
  })

  describe('ingestImages', () => {
    it('sends FormData with multiple images', async () => {
      mockApiFetch.mockResolvedValue({ job_id: 'abc', status: 'queued' })
      const file1 = new File(['img1'], 'page1.jpg', { type: 'image/jpeg' })
      const file2 = new File(['img2'], 'page2.jpg', { type: 'image/jpeg' })

      const result = await ingestImages([file1, file2])

      expect(result.job_id).toBe('abc')
      const [path, options] = mockApiFetch.mock.calls[0]!
      expect(path).toBe('/api/entries/ingest/images')
      expect(options!.body).toBeInstanceOf(FormData)
      const formData = options!.body as FormData
      expect(formData.getAll('images')).toHaveLength(2)
    })

    it('includes entry_date when provided', async () => {
      mockApiFetch.mockResolvedValue({ job_id: 'abc', status: 'queued' })
      const file = new File(['img'], 'page.jpg', { type: 'image/jpeg' })

      await ingestImages([file], '2026-04-12')

      const formData = mockApiFetch.mock.calls[0]![1]!.body as FormData
      expect(formData.get('entry_date')).toBe('2026-04-12')
    })

    it('omits entry_date when not provided', async () => {
      mockApiFetch.mockResolvedValue({ job_id: 'abc', status: 'queued' })
      const file = new File(['img'], 'page.jpg', { type: 'image/jpeg' })

      await ingestImages([file])

      const formData = mockApiFetch.mock.calls[0]![1]!.body as FormData
      expect(formData.get('entry_date')).toBeNull()
    })

    it('sends empty headers to let browser set multipart Content-Type', async () => {
      mockApiFetch.mockResolvedValue({ job_id: 'ghi', status: 'queued' })
      const file = new File(['img'], 'page.png', { type: 'image/png' })

      await ingestImages([file])

      const options = mockApiFetch.mock.calls[0]![1]
      expect(options!.headers).toEqual({})
    })

    it('handles a single image', async () => {
      mockApiFetch.mockResolvedValue({ job_id: 'single', status: 'queued' })
      const file = new File(['img'], 'page.jpg', { type: 'image/jpeg' })

      const result = await ingestImages([file])

      expect(result.job_id).toBe('single')
      const formData = mockApiFetch.mock.calls[0]![1]!.body as FormData
      expect(formData.getAll('images')).toHaveLength(1)
    })
  })
})
