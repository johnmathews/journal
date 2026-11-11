import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  reloadOcrContext,
  reloadTranscriptionContext,
  reloadMoodDimensions,
} from '../admin'

vi.mock('../client', () => ({
  apiFetch: vi.fn(),
}))

import { apiFetch } from '../client'
const mockApiFetch = vi.mocked(apiFetch)

describe('admin API', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('reloadOcrContext calls POST /api/admin/reload/ocr-context', async () => {
    const payload = {
      reloaded: 'ocr-context',
      provider: 'gemini',
      model: 'gemini-2.5-pro',
      dual_pass: false,
      context_files: 3,
      context_chars: 1200,
      reloaded_at: '2026-06-10T12:00:00Z',
    }
    mockApiFetch.mockResolvedValue(payload)

    const result = await reloadOcrContext()

    expect(mockApiFetch).toHaveBeenCalledWith('/api/admin/reload/ocr-context', {
      method: 'POST',
    })
    expect(result).toEqual(payload)
  })

  it('reloadTranscriptionContext calls POST /api/admin/reload/transcription-context', async () => {
    const payload = {
      reloaded: 'transcription-context',
      stack: 'openai/whisper-1',
      context_files: 2,
      context_chars: 800,
      reloaded_at: '2026-06-10T12:00:00Z',
    }
    mockApiFetch.mockResolvedValue(payload)

    const result = await reloadTranscriptionContext()

    expect(mockApiFetch).toHaveBeenCalledWith(
      '/api/admin/reload/transcription-context',
      { method: 'POST' },
    )
    expect(result).toEqual(payload)
  })

  it('reloadMoodDimensions calls POST /api/admin/reload/mood-dimensions', async () => {
    const payload = {
      reloaded: 'mood-dimensions',
      dimension_count: 2,
      dimensions: ['valence', 'energy'],
      reloaded_at: '2026-06-10T12:00:00Z',
    }
    mockApiFetch.mockResolvedValue(payload)

    const result = await reloadMoodDimensions()

    expect(mockApiFetch).toHaveBeenCalledWith(
      '/api/admin/reload/mood-dimensions',
      { method: 'POST' },
    )
    expect(result).toEqual(payload)
  })

  it('propagates rejections from apiFetch', async () => {
    const failure = new Error('admin reload failed')
    mockApiFetch.mockRejectedValue(failure)

    await expect(reloadMoodDimensions()).rejects.toThrow('admin reload failed')
  })
})
