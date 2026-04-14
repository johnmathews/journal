import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import VoiceRecordPanel from '../VoiceRecordPanel.vue'
import { useEntriesStore } from '@/stores/entries'
import { useJobsStore } from '@/stores/jobs'

vi.mock('@/api/entities', () => ({
  triggerEntityExtraction: vi.fn(),
}))

vi.mock('@/api/jobs', () => ({
  triggerMoodBackfill: vi.fn(),
  getJob: vi.fn(),
}))

// Stub URL.createObjectURL / revokeObjectURL
if (typeof URL.createObjectURL === 'undefined') {
  URL.createObjectURL = vi.fn(() => 'blob:mock-url')
}
if (typeof URL.revokeObjectURL === 'undefined') {
  URL.revokeObjectURL = vi.fn()
}

// Mock MediaRecorder
class MockMediaRecorder {
  state = 'inactive' as 'inactive' | 'recording'
  ondataavailable: ((e: { data: Blob }) => void) | null = null
  onstop: (() => void) | null = null

  start() {
    this.state = 'recording'
  }

  stop() {
    this.state = 'inactive'
    if (this.ondataavailable) {
      this.ondataavailable({
        data: new Blob(['audio'], { type: 'audio/webm' }),
      })
    }
    if (this.onstop) this.onstop()
  }

  static isTypeSupported() {
    return true
  }
}

// Mock navigator.mediaDevices
const mockStream = {
  getTracks: () => [{ stop: vi.fn() }],
}

function mountPanel(
  props: { entryDate: string } = { entryDate: '2026-04-14' },
) {
  return mount(VoiceRecordPanel, { props })
}

describe('VoiceRecordPanel', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.stubGlobal('MediaRecorder', MockMediaRecorder)
    vi.stubGlobal('navigator', {
      ...navigator,
      mediaDevices: {
        getUserMedia: vi.fn().mockResolvedValue(mockStream),
      },
    })
  })

  it('renders start recording button', () => {
    const wrapper = mountPanel()
    expect(wrapper.text()).toContain('Record a voice journal entry')
    expect(wrapper.find('[data-testid="start-button"]').exists()).toBe(true)
  })

  it('shows recording indicator after start', async () => {
    const wrapper = mountPanel()
    await wrapper.find('[data-testid="start-button"]').trigger('click')
    await flushPromises()

    expect(wrapper.text()).toContain('Recording...')
    expect(wrapper.find('[data-testid="stop-button"]').exists()).toBe(true)
  })

  it('adds recording to list after stop', async () => {
    const wrapper = mountPanel()
    await wrapper.find('[data-testid="start-button"]').trigger('click')
    await flushPromises()

    await wrapper.find('[data-testid="stop-button"]').trigger('click')
    await flushPromises()

    expect(wrapper.text()).toContain('Recording 1')
    expect(wrapper.find('[data-testid="submit-button"]').exists()).toBe(true)
  })

  it('shows submit button label', async () => {
    const wrapper = mountPanel()
    await wrapper.find('[data-testid="start-button"]').trigger('click')
    await flushPromises()
    await wrapper.find('[data-testid="stop-button"]').trigger('click')
    await flushPromises()

    expect(wrapper.find('[data-testid="submit-button"]').text()).toBe(
      'Submit for Transcription',
    )
  })

  it('shows add recording button after first recording', async () => {
    const wrapper = mountPanel()
    await wrapper.find('[data-testid="start-button"]').trigger('click')
    await flushPromises()
    await wrapper.find('[data-testid="stop-button"]').trigger('click')
    await flushPromises()

    expect(wrapper.find('[data-testid="add-recording-button"]').exists()).toBe(
      true,
    )
    expect(wrapper.text()).toContain('+ Add recording')
  })

  it('can remove a recording', async () => {
    const wrapper = mountPanel()
    await wrapper.find('[data-testid="start-button"]').trigger('click')
    await flushPromises()
    await wrapper.find('[data-testid="stop-button"]').trigger('click')
    await flushPromises()

    expect(wrapper.text()).toContain('Recording 1')
    await wrapper.find('[data-testid="remove-button-0"]').trigger('click')
    await flushPromises()

    // Back to empty state
    expect(wrapper.text()).toContain('Record a voice journal entry')
  })

  it('has play button for each recording', async () => {
    const wrapper = mountPanel()
    await wrapper.find('[data-testid="start-button"]').trigger('click')
    await flushPromises()
    await wrapper.find('[data-testid="stop-button"]').trigger('click')
    await flushPromises()

    expect(wrapper.find('[data-testid="play-button-0"]').exists()).toBe(true)
  })

  it('shows recording count in footer', async () => {
    const wrapper = mountPanel()
    // Record twice
    await wrapper.find('[data-testid="start-button"]').trigger('click')
    await flushPromises()
    await wrapper.find('[data-testid="stop-button"]').trigger('click')
    await flushPromises()

    await wrapper.find('[data-testid="add-recording-button"]').trigger('click')
    await flushPromises()
    await wrapper.find('[data-testid="stop-button"]').trigger('click')
    await flushPromises()

    expect(wrapper.text()).toContain('2 recordings')
  })

  it('shows singular "recording" for one item', async () => {
    const wrapper = mountPanel()
    await wrapper.find('[data-testid="start-button"]').trigger('click')
    await flushPromises()
    await wrapper.find('[data-testid="stop-button"]').trigger('click')
    await flushPromises()

    expect(wrapper.text()).toContain('1 recording')
    expect(wrapper.text()).not.toContain('1 recordings')
  })

  it('submits recordings and shows job progress', async () => {
    const wrapper = mountPanel()
    const entriesStore = useEntriesStore()
    const jobsStore = useJobsStore()

    // Record one
    await wrapper.find('[data-testid="start-button"]').trigger('click')
    await flushPromises()
    await wrapper.find('[data-testid="stop-button"]').trigger('click')
    await flushPromises()

    // Mock the upload
    entriesStore.uploadAudio = vi.fn().mockResolvedValue({
      job_id: 'test-job-123',
      status: 'queued',
    })
    jobsStore.trackJob = vi.fn()

    await wrapper.find('[data-testid="submit-button"]').trigger('click')
    await flushPromises()

    expect(entriesStore.uploadAudio).toHaveBeenCalledOnce()
    expect(jobsStore.trackJob).toHaveBeenCalledWith(
      'test-job-123',
      'ingest_audio',
      expect.objectContaining({ recording_count: 1 }),
    )

    // Should show processing state
    expect(wrapper.text()).toContain('Transcribing')
  })

  it('shows mic error when getUserMedia fails', async () => {
    vi.stubGlobal('navigator', {
      ...navigator,
      mediaDevices: {
        getUserMedia: vi.fn().mockRejectedValue(new Error('NotAllowedError')),
      },
    })

    const wrapper = mountPanel()
    await wrapper.find('[data-testid="start-button"]').trigger('click')
    await flushPromises()

    expect(wrapper.text()).toContain('Could not access microphone')
  })

  it('shows info about combining recordings', () => {
    const wrapper = mountPanel()
    expect(wrapper.text()).toContain('combined')
  })
})
