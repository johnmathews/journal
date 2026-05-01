import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createRouter, createWebHistory } from 'vue-router'
import AdminServerView from '../AdminServerView.vue'

vi.mock('@/api/client', () => ({
  apiFetch: vi.fn(),
  ApiRequestError: class ApiRequestError extends Error {
    constructor(
      public status: number,
      public errorCode: string,
      message: string,
    ) {
      super(message)
      this.name = 'ApiRequestError'
    }
  },
}))

vi.mock('@/api/admin', () => ({
  reloadOcrContext: vi.fn(),
  reloadTranscriptionContext: vi.fn(),
  reloadMoodDimensions: vi.fn(),
}))

import { ApiRequestError } from '@/api/client'
import {
  reloadMoodDimensions,
  reloadOcrContext,
  reloadTranscriptionContext,
} from '@/api/admin'

const mockReloadOcr = vi.mocked(reloadOcrContext)
const mockReloadTranscription = vi.mocked(reloadTranscriptionContext)
const mockReloadMood = vi.mocked(reloadMoodDimensions)

const ocrSummary = {
  reloaded: 'ocr-context' as const,
  provider: 'anthropic',
  model: 'claude-opus-4-6',
  dual_pass: false,
  context_files: 3,
  context_chars: 1234,
  reloaded_at: '2026-05-01T17:42:00Z',
}

const transcriptionSummary = {
  reloaded: 'transcription-context' as const,
  stack: 'openai/whisper-1',
  context_files: 3,
  context_chars: 1234,
  reloaded_at: '2026-05-01T17:42:01Z',
}

const moodSummary = {
  reloaded: 'mood-dimensions' as const,
  dimension_count: 2,
  dimensions: ['joy_sadness', 'agency'],
  reloaded_at: '2026-05-01T17:42:02Z',
}

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', component: { template: '<div/>' } },
    {
      path: '/admin/server',
      name: 'admin-server',
      component: AdminServerView,
    },
  ],
})

function mountView() {
  return mount(AdminServerView, {
    global: {
      plugins: [createPinia(), router],
    },
  })
}

function findReloadButton(
  wrapper: ReturnType<typeof mountView>,
  testid: string,
) {
  const section = wrapper.find(`[data-testid="${testid}"]`)
  return section.find('button')
}

describe('AdminServerView', () => {
  beforeEach(async () => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    router.push('/admin/server')
    await router.isReady()
  })

  it('renders all three reload sections', () => {
    const wrapper = mountView()
    expect(wrapper.find('[data-testid="reload-ocr-context"]').exists()).toBe(
      true,
    )
    expect(
      wrapper.find('[data-testid="reload-transcription-context"]').exists(),
    ).toBe(true)
    expect(
      wrapper.find('[data-testid="reload-mood-dimensions"]').exists(),
    ).toBe(true)
  })

  it('triggers OCR reload, displays summary fields', async () => {
    mockReloadOcr.mockResolvedValue(ocrSummary)
    const wrapper = mountView()

    await findReloadButton(wrapper, 'reload-ocr-context').trigger('click')
    await flushPromises()

    expect(mockReloadOcr).toHaveBeenCalledTimes(1)

    const section = wrapper.find('[data-testid="reload-ocr-context"]')
    expect(section.text()).toContain('anthropic')
    expect(section.text()).toContain('claude-opus-4-6')
    // 3 files / 1,234 chars
    expect(section.text()).toContain('3')
    expect(section.text()).toContain('1,234')
  })

  it('shows dual-pass marker when summary reports dual_pass=true', async () => {
    mockReloadOcr.mockResolvedValue({ ...ocrSummary, dual_pass: true })
    const wrapper = mountView()

    await findReloadButton(wrapper, 'reload-ocr-context').trigger('click')
    await flushPromises()

    expect(wrapper.find('[data-testid="reload-ocr-context"]').text()).toContain(
      'dual-pass',
    )
  })

  it('triggers transcription reload, displays stack', async () => {
    mockReloadTranscription.mockResolvedValue(transcriptionSummary)
    const wrapper = mountView()

    await findReloadButton(wrapper, 'reload-transcription-context').trigger(
      'click',
    )
    await flushPromises()

    expect(mockReloadTranscription).toHaveBeenCalledTimes(1)
    expect(
      wrapper.find('[data-testid="reload-transcription-context"]').text(),
    ).toContain('openai/whisper-1')
  })

  it('triggers mood reload, displays dimension names', async () => {
    mockReloadMood.mockResolvedValue(moodSummary)
    const wrapper = mountView()

    await findReloadButton(wrapper, 'reload-mood-dimensions').trigger('click')
    await flushPromises()

    expect(mockReloadMood).toHaveBeenCalledTimes(1)
    const text = wrapper.find('[data-testid="reload-mood-dimensions"]').text()
    expect(text).toContain('joy_sadness')
    expect(text).toContain('agency')
  })

  it('shows API error message on ApiRequestError', async () => {
    mockReloadMood.mockRejectedValue(
      new ApiRequestError(
        409,
        'reload_unavailable',
        'mood scoring is disabled',
      ),
    )
    const wrapper = mountView()

    await findReloadButton(wrapper, 'reload-mood-dimensions').trigger('click')
    await flushPromises()

    expect(
      wrapper.find('[data-testid="reload-mood-dimensions"]').text(),
    ).toContain('mood scoring is disabled')
  })

  it('shows generic fallback error on non-ApiRequestError', async () => {
    mockReloadOcr.mockRejectedValue(new TypeError('network down'))
    const wrapper = mountView()

    await findReloadButton(wrapper, 'reload-ocr-context').trigger('click')
    await flushPromises()

    expect(wrapper.find('[data-testid="reload-ocr-context"]').text()).toContain(
      'Failed to reload OCR context',
    )
  })

  it('disables button while a reload is in flight', async () => {
    let resolveFn!: (v: typeof ocrSummary) => void
    mockReloadOcr.mockReturnValue(
      new Promise((resolve) => {
        resolveFn = resolve
      }),
    )
    const wrapper = mountView()
    const btn = findReloadButton(wrapper, 'reload-ocr-context')

    await btn.trigger('click')
    expect((btn.element as HTMLButtonElement).disabled).toBe(true)
    expect(btn.text()).toContain('Reloading')

    resolveFn(ocrSummary)
    await flushPromises()
    expect((btn.element as HTMLButtonElement).disabled).toBe(false)
  })

  it('clears a stale error when a subsequent reload succeeds', async () => {
    mockReloadOcr.mockRejectedValueOnce(
      new ApiRequestError(500, 'internal', 'oops'),
    )
    const wrapper = mountView()
    const btn = findReloadButton(wrapper, 'reload-ocr-context')

    await btn.trigger('click')
    await flushPromises()
    expect(wrapper.find('[data-testid="reload-ocr-context"]').text()).toContain(
      'oops',
    )

    mockReloadOcr.mockResolvedValueOnce(ocrSummary)
    await btn.trigger('click')
    await flushPromises()
    expect(
      wrapper.find('[data-testid="reload-ocr-context"]').text(),
    ).not.toContain('oops')
  })
})
