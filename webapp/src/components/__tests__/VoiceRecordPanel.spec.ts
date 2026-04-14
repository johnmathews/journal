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

  it('displays formatted duration in recording list', async () => {
    const wrapper = mountPanel()
    await wrapper.find('[data-testid="start-button"]').trigger('click')
    await flushPromises()
    await wrapper.find('[data-testid="stop-button"]').trigger('click')
    await flushPromises()

    // Duration is 0 because our mock fires onstop immediately
    expect(wrapper.text()).toContain('0:00')
  })

  it('displays formatted size in recording list', async () => {
    const wrapper = mountPanel()
    await wrapper.find('[data-testid="start-button"]').trigger('click')
    await flushPromises()
    await wrapper.find('[data-testid="stop-button"]').trigger('click')
    await flushPromises()

    // The mock blob has 5 bytes ("audio")
    expect(wrapper.text()).toContain('5 B')
  })

  it('shows submit error and retry button on failure', async () => {
    const wrapper = mountPanel()
    const entriesStore = useEntriesStore()

    await wrapper.find('[data-testid="start-button"]').trigger('click')
    await flushPromises()
    await wrapper.find('[data-testid="stop-button"]').trigger('click')
    await flushPromises()

    entriesStore.uploadAudio = vi
      .fn()
      .mockRejectedValue(new Error('Server error'))
    entriesStore.createError = 'Server error'

    await wrapper.find('[data-testid="submit-button"]').trigger('click')
    await flushPromises()

    expect(wrapper.text()).toContain('Server error')
    expect(wrapper.text()).toContain('Try Again')
  })

  it('toggles playback icon between play and pause', async () => {
    // Stub Audio constructor — must use function() so it works with `new`
    const mockAudio = {
      play: vi.fn(),
      pause: vi.fn(),
      onended: null as (() => void) | null,
    }
    vi.stubGlobal('Audio', function () {
      return mockAudio
    })

    const wrapper = mountPanel()
    await wrapper.find('[data-testid="start-button"]').trigger('click')
    await flushPromises()
    await wrapper.find('[data-testid="stop-button"]').trigger('click')
    await flushPromises()

    // Click play
    await wrapper.find('[data-testid="play-button-0"]').trigger('click')
    await flushPromises()
    expect(mockAudio.play).toHaveBeenCalled()

    // Click again to stop
    await wrapper.find('[data-testid="play-button-0"]').trigger('click')
    await flushPromises()
    expect(mockAudio.pause).toHaveBeenCalled()
  })

  it('shows acknowledge button during processing', async () => {
    const wrapper = mountPanel()
    const entriesStore = useEntriesStore()
    const jobsStore = useJobsStore()

    await wrapper.find('[data-testid="start-button"]').trigger('click')
    await flushPromises()
    await wrapper.find('[data-testid="stop-button"]').trigger('click')
    await flushPromises()

    entriesStore.uploadAudio = vi.fn().mockResolvedValue({
      job_id: 'job-1',
      status: 'queued',
    })
    jobsStore.trackJob = vi.fn()

    await wrapper.find('[data-testid="submit-button"]').trigger('click')
    await flushPromises()

    expect(wrapper.find('[data-testid="acknowledge-button"]').exists()).toBe(
      true,
    )
  })

  it('retry clears error and shows recording UI again', async () => {
    const wrapper = mountPanel()
    const entriesStore = useEntriesStore()

    await wrapper.find('[data-testid="start-button"]').trigger('click')
    await flushPromises()
    await wrapper.find('[data-testid="stop-button"]').trigger('click')
    await flushPromises()

    entriesStore.uploadAudio = vi.fn().mockRejectedValue(new Error('fail'))
    entriesStore.createError = 'fail'

    await wrapper.find('[data-testid="submit-button"]').trigger('click')
    await flushPromises()

    expect(wrapper.text()).toContain('Try Again')

    // Click retry
    const retryButton = wrapper
      .findAll('button')
      .find((b) => b.text() === 'Try Again')
    expect(retryButton).toBeTruthy()
    await retryButton!.trigger('click')
    await flushPromises()

    // Should show the recordings list again, not the error
    expect(wrapper.text()).toContain('Recording 1')
    expect(wrapper.text()).not.toContain('Try Again')
  })

  it('does not submit when no recordings exist', async () => {
    const wrapper = mountPanel()
    // The submit button should not be visible with no recordings
    expect(wrapper.find('[data-testid="submit-button"]').exists()).toBe(false)
  })

  it('shows total duration in footer', async () => {
    const wrapper = mountPanel()
    // Record twice
    await wrapper.find('[data-testid="start-button"]').trigger('click')
    await flushPromises()
    await wrapper.find('[data-testid="stop-button"]').trigger('click')
    await flushPromises()

    // Footer should show total duration (0:00 since mocks are instant)
    expect(wrapper.text()).toContain('0:00 total')
  })

  it('dismiss button on mic error clears the error', async () => {
    vi.stubGlobal('navigator', {
      ...navigator,
      mediaDevices: {
        getUserMedia: vi.fn().mockRejectedValue(new Error('denied')),
      },
    })

    const wrapper = mountPanel()
    await wrapper.find('[data-testid="start-button"]').trigger('click')
    await flushPromises()

    expect(wrapper.text()).toContain('Could not access microphone')

    // Dismiss the error
    const dismissBtn = wrapper
      .findAll('button')
      .find((b) => b.text() === '\u00d7')
    expect(dismissBtn).toBeTruthy()
    await dismissBtn!.trigger('click')
    await flushPromises()

    expect(wrapper.text()).not.toContain('Could not access microphone')
  })

  it('auto-acknowledges when job reaches terminal state', async () => {
    const wrapper = mountPanel()
    const entriesStore = useEntriesStore()
    const jobsStore = useJobsStore()

    await wrapper.find('[data-testid="start-button"]').trigger('click')
    await flushPromises()
    await wrapper.find('[data-testid="stop-button"]').trigger('click')
    await flushPromises()

    entriesStore.uploadAudio = vi.fn().mockResolvedValue({
      job_id: 'auto-ack-job',
      status: 'queued',
    })
    jobsStore.trackJob = vi.fn()

    await wrapper.find('[data-testid="submit-button"]').trigger('click')
    await flushPromises()

    // Should be in processing state
    expect(wrapper.text()).toContain('Transcribing')

    // Simulate job reaching terminal state
    jobsStore.jobs['auto-ack-job'] = {
      id: 'auto-ack-job',
      type: 'ingest_audio',
      status: 'succeeded',
      params: {},
      progress_current: 1,
      progress_total: 1,
      result: { entry_id: 42 },
      error_message: null,
      status_detail: null,
      created_at: new Date().toISOString(),
      started_at: new Date().toISOString(),
      finished_at: new Date().toISOString(),
    }
    await flushPromises()

    // Should have auto-acknowledged and returned to empty state
    expect(wrapper.text()).toContain('Record a voice journal entry')
  })

  it('emits submitted event with job id', async () => {
    const wrapper = mountPanel()
    const entriesStore = useEntriesStore()
    const jobsStore = useJobsStore()

    await wrapper.find('[data-testid="start-button"]').trigger('click')
    await flushPromises()
    await wrapper.find('[data-testid="stop-button"]').trigger('click')
    await flushPromises()

    entriesStore.uploadAudio = vi.fn().mockResolvedValue({
      job_id: 'emitted-job',
      status: 'queued',
    })
    jobsStore.trackJob = vi.fn()

    await wrapper.find('[data-testid="submit-button"]').trigger('click')
    await flushPromises()

    expect(wrapper.emitted('submitted')).toBeTruthy()
    expect(wrapper.emitted('submitted')![0]).toEqual(['emitted-job'])
  })
})
