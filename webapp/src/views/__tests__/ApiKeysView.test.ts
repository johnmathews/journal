import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createRouter, createWebHistory } from 'vue-router'
import ApiKeysView from '../ApiKeysView.vue'

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

import { apiFetch, ApiRequestError } from '@/api/client'
const mockApiFetch = vi.mocked(apiFetch)

const fakeKeys = [
  {
    id: 1,
    name: 'MCP Server',
    prefix: 'jrn_abc',
    created_at: '2026-01-15T10:00:00Z',
    last_used_at: '2026-04-10T14:30:00Z',
    expires_at: null,
  },
  {
    id: 2,
    name: 'CI Pipeline',
    prefix: 'jrn_def',
    created_at: '2026-02-20T08:00:00Z',
    last_used_at: null,
    expires_at: '2026-12-31T00:00:00Z',
  },
]

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', component: { template: '<div/>' } },
    { path: '/api-keys', name: 'api-keys', component: ApiKeysView },
  ],
})

function mountComponent() {
  return mount(ApiKeysView, {
    global: {
      plugins: [createPinia(), router],
    },
  })
}

describe('ApiKeysView', () => {
  beforeEach(async () => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    router.push('/api-keys')
    await router.isReady()
  })

  it('renders the heading', async () => {
    mockApiFetch.mockResolvedValue({ items: [] })
    const wrapper = mountComponent()
    await flushPromises()

    expect(wrapper.find('h1').text()).toBe('API Keys')
  })

  it('loads and displays keys', async () => {
    mockApiFetch.mockResolvedValue({ items: fakeKeys })

    const wrapper = mountComponent()
    await flushPromises()

    expect(mockApiFetch).toHaveBeenCalledWith('/api/auth/api-keys')
    expect(wrapper.text()).toContain('MCP Server')
    expect(wrapper.text()).toContain('CI Pipeline')
    expect(wrapper.text()).toContain('jrn_abc')
    expect(wrapper.text()).toContain('jrn_def')
  })

  it('shows empty state when no keys exist', async () => {
    mockApiFetch.mockResolvedValue({ items: [] })

    const wrapper = mountComponent()
    await flushPromises()

    expect(wrapper.text()).toContain('No API keys yet')
  })

  it('shows error when loading keys fails', async () => {
    mockApiFetch.mockRejectedValue(
      new ApiRequestError(500, 'internal', 'Server error'),
    )

    const wrapper = mountComponent()
    await flushPromises()

    expect(wrapper.text()).toContain('Server error')
  })

  it('shows generic error for non-ApiRequestError on load', async () => {
    mockApiFetch.mockRejectedValue(new TypeError('Network error'))

    const wrapper = mountComponent()
    await flushPromises()

    expect(wrapper.text()).toContain('Failed to load API keys')
  })

  it('shows create form when Generate button is clicked', async () => {
    mockApiFetch.mockResolvedValue({ items: [] })

    const wrapper = mountComponent()
    await flushPromises()

    const generateBtn = wrapper
      .findAll('button')
      .find((b) => b.text() === 'Generate New Key')
    expect(generateBtn).toBeDefined()
    await generateBtn!.trigger('click')

    expect(wrapper.find('#key-name').exists()).toBe(true)
    expect(wrapper.find('#key-expiry').exists()).toBe(true)
  })

  it('creates a key and shows it', async () => {
    const createdKeyResponse = {
      id: 3,
      name: 'Test Key',
      prefix: 'jrn_xyz',
      key: 'jrn_xyz_full_secret_key',
      created_at: '2026-04-14T10:00:00Z',
      expires_at: null,
    }

    // First call: loadKeys, second call: createKey, third call: loadKeys again
    mockApiFetch
      .mockResolvedValueOnce({ items: [] })
      .mockResolvedValueOnce(createdKeyResponse)
      .mockResolvedValueOnce({
        items: [{ ...createdKeyResponse, last_used_at: null }],
      })

    const wrapper = mountComponent()
    await flushPromises()

    // Open create form
    const generateBtn = wrapper
      .findAll('button')
      .find((b) => b.text() === 'Generate New Key')
    await generateBtn!.trigger('click')

    await wrapper.find('#key-name').setValue('Test Key')
    await wrapper.find('form').trigger('submit')
    await flushPromises()

    expect(mockApiFetch).toHaveBeenCalledWith('/api/auth/api-keys', {
      method: 'POST',
      body: JSON.stringify({ name: 'Test Key' }),
    })
    expect(wrapper.text()).toContain('API key created: Test Key')
    expect(wrapper.text()).toContain('jrn_xyz_full_secret_key')
  })

  it('creates a key with expiry date', async () => {
    const createdKeyResponse = {
      id: 4,
      name: 'Expiring Key',
      prefix: 'jrn_exp',
      key: 'jrn_exp_secret',
      created_at: '2026-04-14T10:00:00Z',
      expires_at: '2026-12-31',
    }

    mockApiFetch
      .mockResolvedValueOnce({ items: [] })
      .mockResolvedValueOnce(createdKeyResponse)
      .mockResolvedValueOnce({ items: [] })

    const wrapper = mountComponent()
    await flushPromises()

    const generateBtn = wrapper
      .findAll('button')
      .find((b) => b.text() === 'Generate New Key')
    await generateBtn!.trigger('click')

    await wrapper.find('#key-name').setValue('Expiring Key')
    await wrapper.find('#key-expiry').setValue('2026-12-31')
    await wrapper.find('form').trigger('submit')
    await flushPromises()

    expect(mockApiFetch).toHaveBeenCalledWith('/api/auth/api-keys', {
      method: 'POST',
      body: JSON.stringify({ name: 'Expiring Key', expires_at: '2026-12-31' }),
    })
  })

  it('shows error when creating key fails', async () => {
    mockApiFetch
      .mockResolvedValueOnce({ items: [] })
      .mockRejectedValueOnce(
        new ApiRequestError(400, 'invalid', 'Name is required'),
      )

    const wrapper = mountComponent()
    await flushPromises()

    const generateBtn = wrapper
      .findAll('button')
      .find((b) => b.text() === 'Generate New Key')
    await generateBtn!.trigger('click')

    await wrapper.find('#key-name').setValue('Test')
    await wrapper.find('form').trigger('submit')
    await flushPromises()

    expect(wrapper.text()).toContain('Name is required')
  })

  it('shows generic error for non-ApiRequestError on create', async () => {
    mockApiFetch
      .mockResolvedValueOnce({ items: [] })
      .mockRejectedValueOnce(new TypeError('Network error'))

    const wrapper = mountComponent()
    await flushPromises()

    const generateBtn = wrapper
      .findAll('button')
      .find((b) => b.text() === 'Generate New Key')
    await generateBtn!.trigger('click')

    await wrapper.find('#key-name').setValue('Test')
    await wrapper.find('form').trigger('submit')
    await flushPromises()

    expect(wrapper.text()).toContain('Failed to create API key')
  })

  it('revokes a key', async () => {
    mockApiFetch.mockResolvedValueOnce({ items: fakeKeys })

    // happy-dom does not provide window.confirm, so define it directly
    globalThis.confirm = vi.fn(() => true)

    const wrapper = mountComponent()
    await flushPromises()

    mockApiFetch.mockResolvedValueOnce(undefined)

    const revokeButtons = wrapper
      .findAll('button')
      .filter((b) => b.text() === 'Revoke')
    expect(revokeButtons.length).toBe(2)

    await revokeButtons[0].trigger('click')
    await flushPromises()

    expect(mockApiFetch).toHaveBeenCalledWith('/api/auth/api-keys/1', {
      method: 'DELETE',
    })
    // Key should be removed from the list
    expect(wrapper.text()).not.toContain('MCP Server')
    expect(wrapper.text()).toContain('CI Pipeline')
  })

  it('does not revoke when confirm is cancelled', async () => {
    mockApiFetch.mockResolvedValueOnce({ items: fakeKeys })

    globalThis.confirm = vi.fn(() => false)

    const wrapper = mountComponent()
    await flushPromises()

    const revokeButtons = wrapper
      .findAll('button')
      .filter((b) => b.text() === 'Revoke')
    await revokeButtons[0].trigger('click')
    await flushPromises()

    // Should not have called DELETE
    expect(mockApiFetch).not.toHaveBeenCalledWith(
      '/api/auth/api-keys/1',
      expect.anything(),
    )
    // Key should still be in the list
    expect(wrapper.text()).toContain('MCP Server')
  })

  it('shows error when revoking key fails', async () => {
    mockApiFetch.mockResolvedValueOnce({ items: fakeKeys })

    globalThis.confirm = vi.fn(() => true)
    mockApiFetch.mockRejectedValueOnce(
      new ApiRequestError(500, 'internal', 'Revoke failed'),
    )

    const wrapper = mountComponent()
    await flushPromises()

    const revokeButtons = wrapper
      .findAll('button')
      .filter((b) => b.text() === 'Revoke')
    await revokeButtons[0].trigger('click')
    await flushPromises()

    expect(wrapper.text()).toContain('Revoke failed')
  })

  it('shows generic error for non-ApiRequestError on revoke', async () => {
    mockApiFetch.mockResolvedValueOnce({ items: fakeKeys })

    globalThis.confirm = vi.fn(() => true)
    mockApiFetch.mockRejectedValueOnce(new TypeError('Network error'))

    const wrapper = mountComponent()
    await flushPromises()

    const revokeButtons = wrapper
      .findAll('button')
      .filter((b) => b.text() === 'Revoke')
    await revokeButtons[0].trigger('click')
    await flushPromises()

    expect(wrapper.text()).toContain('Failed to revoke API key')
  })

  it('dismisses created key alert', async () => {
    const createdKeyResponse = {
      id: 3,
      name: 'Test Key',
      prefix: 'jrn_xyz',
      key: 'jrn_xyz_full_secret_key',
      created_at: '2026-04-14T10:00:00Z',
      expires_at: null,
    }

    mockApiFetch
      .mockResolvedValueOnce({ items: [] })
      .mockResolvedValueOnce(createdKeyResponse)
      .mockResolvedValueOnce({ items: [] })

    const wrapper = mountComponent()
    await flushPromises()

    const generateBtn = wrapper
      .findAll('button')
      .find((b) => b.text() === 'Generate New Key')
    await generateBtn!.trigger('click')
    await wrapper.find('#key-name').setValue('Test Key')
    await wrapper.find('form').trigger('submit')
    await flushPromises()

    expect(wrapper.text()).toContain('API key created:')
    expect(wrapper.text()).toContain('Test Key')

    const dismissBtn = wrapper
      .findAll('button')
      .find((b) => b.text() === 'Dismiss')
    await dismissBtn!.trigger('click')
    await wrapper.vm.$nextTick()

    expect(wrapper.text()).not.toContain('jrn_xyz_full_secret_key')
  })

  it('cancels create form', async () => {
    mockApiFetch.mockResolvedValue({ items: [] })

    const wrapper = mountComponent()
    await flushPromises()

    const generateBtn = wrapper
      .findAll('button')
      .find((b) => b.text() === 'Generate New Key')
    await generateBtn!.trigger('click')

    expect(wrapper.find('#key-name').exists()).toBe(true)

    const cancelBtn = wrapper
      .findAll('button')
      .find((b) => b.text() === 'Cancel')
    await cancelBtn!.trigger('click')
    await wrapper.vm.$nextTick()

    expect(wrapper.find('#key-name').exists()).toBe(false)
  })

  it('copies key to clipboard when Copy button is clicked', async () => {
    const createdKeyResponse = {
      id: 3,
      name: 'Test Key',
      prefix: 'jrn_xyz',
      key: 'jrn_xyz_full_secret_key',
      created_at: '2026-04-14T10:00:00Z',
      expires_at: null,
    }

    mockApiFetch
      .mockResolvedValueOnce({ items: [] })
      .mockResolvedValueOnce(createdKeyResponse)
      .mockResolvedValueOnce({ items: [] })

    // Mock navigator.clipboard
    const writeTextMock = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: writeTextMock },
      writable: true,
      configurable: true,
    })

    const wrapper = mountComponent()
    await flushPromises()

    const generateBtn = wrapper
      .findAll('button')
      .find((b) => b.text() === 'Generate New Key')
    await generateBtn!.trigger('click')
    await wrapper.find('#key-name').setValue('Test Key')
    await wrapper.find('form').trigger('submit')
    await flushPromises()

    const copyBtn = wrapper.findAll('button').find((b) => b.text() === 'Copy')
    expect(copyBtn).toBeDefined()
    await copyBtn!.trigger('click')
    await flushPromises()

    expect(writeTextMock).toHaveBeenCalledWith('jrn_xyz_full_secret_key')
    expect(wrapper.text()).toContain('Copied!')
  })

  it('handles clipboard copy failure gracefully', async () => {
    const createdKeyResponse = {
      id: 3,
      name: 'Test Key',
      prefix: 'jrn_xyz',
      key: 'jrn_xyz_full_secret_key',
      created_at: '2026-04-14T10:00:00Z',
      expires_at: null,
    }

    mockApiFetch
      .mockResolvedValueOnce({ items: [] })
      .mockResolvedValueOnce(createdKeyResponse)
      .mockResolvedValueOnce({ items: [] })

    // Mock navigator.clipboard to throw
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: vi.fn().mockRejectedValue(new Error('Not allowed')) },
      writable: true,
      configurable: true,
    })

    const wrapper = mountComponent()
    await flushPromises()

    const generateBtn = wrapper
      .findAll('button')
      .find((b) => b.text() === 'Generate New Key')
    await generateBtn!.trigger('click')
    await wrapper.find('#key-name').setValue('Test Key')
    await wrapper.find('form').trigger('submit')
    await flushPromises()

    const copyBtn = wrapper.findAll('button').find((b) => b.text() === 'Copy')
    await copyBtn!.trigger('click')
    await flushPromises()

    // Should not crash, still shows Copy (not Copied!)
    expect(wrapper.text()).toContain('Copy')
  })

  it('displays Never for null dates', async () => {
    mockApiFetch.mockResolvedValueOnce({
      items: [
        {
          id: 1,
          name: 'Test',
          prefix: 'jrn_x',
          created_at: '2026-01-15T10:00:00Z',
          last_used_at: null,
          expires_at: null,
        },
      ],
    })

    const wrapper = mountComponent()
    await flushPromises()

    // "Never" should appear for last_used_at and expires_at
    const text = wrapper.text()
    expect(text).toContain('Never')
  })
})
