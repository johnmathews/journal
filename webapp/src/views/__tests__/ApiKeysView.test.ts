import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createRouter, createWebHistory } from 'vue-router'
import ApiKeysView from '../ApiKeysView.vue'
import type { ApiKey, ApiKeyCreatedResponse } from '@/types/auth'

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
    user_id: 1,
    key_prefix: 'jrn_abc',
    created_at: '2026-01-15T10:00:00Z',
    last_used_at: '2026-04-10T14:30:00Z',
    expires_at: null,
    revoked_at: null,
  },
  {
    id: 2,
    name: 'CI Pipeline',
    user_id: 1,
    key_prefix: 'jrn_def',
    created_at: '2026-02-20T08:00:00Z',
    last_used_at: null,
    expires_at: '2026-12-31T00:00:00Z',
    revoked_at: null,
  },
] satisfies ApiKey[]

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
    // clearAllMocks keeps queued mockResolvedValueOnce values; drop them so
    // one test's unused responses can't leak into the next.
    mockApiFetch.mockReset()
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
    // The server sends `key_prefix`; the table shows it followed by "...".
    const prefixes = wrapper.findAll('tbody code').map((c) => c.text())
    expect(prefixes).toEqual(['jrn_abc...', 'jrn_def...'])
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
      user_id: 1,
      key_prefix: 'jrn_xyz',
      key: 'jrn_xyz_full_secret_key',
      created_at: '2026-04-14T10:00:00Z',
      expires_at: null,
      last_used_at: null,
      revoked_at: null,
    } satisfies ApiKeyCreatedResponse

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
      user_id: 1,
      key_prefix: 'jrn_exp',
      key: 'jrn_exp_secret',
      created_at: '2026-04-14T10:00:00Z',
      expires_at: '2026-12-31',
      last_used_at: null,
      revoked_at: null,
    } satisfies ApiKeyCreatedResponse

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

    // #40: the server needs an instant with a time zone, not a bare date.
    // The key expires at the end of the chosen day in the browser's zone.
    const endOfDay = new Date(2026, 11, 31, 23, 59, 59).toISOString()
    expect(mockApiFetch).toHaveBeenCalledWith('/api/auth/api-keys', {
      method: 'POST',
      body: JSON.stringify({ name: 'Expiring Key', expires_at: endOfDay }),
    })
    const sent = JSON.parse(
      (mockApiFetch.mock.calls[1][1] as { body: string }).body,
    )
    expect(sent.expires_at).toMatch(
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/,
    )
    expect(sent).not.toHaveProperty('expires_days')
  })

  it('sends no expiry field when no date is chosen', async () => {
    mockApiFetch
      .mockResolvedValueOnce({ items: [] })
      .mockResolvedValueOnce({ ...fakeKeys[0], key: 'jrn_x' })
      .mockResolvedValueOnce({ items: [] })

    const wrapper = mountComponent()
    await flushPromises()
    await wrapper
      .findAll('button')
      .find((b) => b.text() === 'Generate New Key')!
      .trigger('click')
    await wrapper.find('#key-name').setValue('No Expiry')
    await wrapper.find('form').trigger('submit')
    await flushPromises()

    expect(mockApiFetch).toHaveBeenCalledWith('/api/auth/api-keys', {
      method: 'POST',
      body: JSON.stringify({ name: 'No Expiry' }),
    })
  })

  it('does not offer expiry dates before today', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date(2026, 10, 12, 9, 30))
    try {
      mockApiFetch.mockResolvedValue({ items: [] })
      const wrapper = mountComponent()
      await flushPromises()
      await wrapper
        .findAll('button')
        .find((b) => b.text() === 'Generate New Key')!
        .trigger('click')

      expect(wrapper.find('#key-expiry').attributes('min')).toBe('2026-11-12')
    } finally {
      vi.useRealTimers()
    }
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

    mockApiFetch.mockResolvedValueOnce(undefined).mockResolvedValueOnce({
      items: [
        { ...fakeKeys[0], revoked_at: '2026-11-12T11:11:13Z' },
        fakeKeys[1],
      ],
    })

    const revokeButtons = wrapper
      .findAll('button')
      .filter((b) => b.text() === 'Revoke')
    expect(revokeButtons.length).toBe(2)

    await revokeButtons[0].trigger('click')
    await flushPromises()

    expect(mockApiFetch).toHaveBeenCalledWith('/api/auth/api-keys/1', {
      method: 'DELETE',
    })
    // The page re-reads the list, so it shows what the server now holds:
    // the key stays listed, marked revoked, with no Revoke button.
    expect(mockApiFetch).toHaveBeenLastCalledWith('/api/auth/api-keys')
    expect(wrapper.find('#api-key-row-1').text()).toContain('MCP Server')
    expect(wrapper.find('#api-key-revoked-1').text()).toContain('Revoked')
    expect(wrapper.find('#api-key-revoke-1').exists()).toBe(false)
    expect(wrapper.find('#api-key-revoke-2').exists()).toBe(true)
  })

  it('shows a revoked key as revoked, without a Revoke button', async () => {
    // The list endpoint returns revoked keys too. Before the fix they were
    // shown as active after a reload, with a Revoke button.
    mockApiFetch.mockResolvedValueOnce({
      items: [
        { ...fakeKeys[0], revoked_at: '2026-11-12T11:11:13Z' },
        fakeKeys[1],
      ],
    })
    const wrapper = mountComponent()
    await flushPromises()

    const revoked = wrapper.find('#api-key-revoked-1')
    expect(revoked.exists()).toBe(true)
    expect(revoked.text()).toContain('Revoked')
    expect(revoked.text()).toContain('12 Nov 2026')
    expect(wrapper.find('#api-key-revoke-1').exists()).toBe(false)
    expect(wrapper.find('#api-key-row-1').classes()).toContain('opacity-60')

    expect(wrapper.find('#api-key-revoke-2').exists()).toBe(true)
    expect(wrapper.find('#api-key-revoked-2').exists()).toBe(false)
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
      user_id: 1,
      key_prefix: 'jrn_xyz',
      key: 'jrn_xyz_full_secret_key',
      created_at: '2026-04-14T10:00:00Z',
      expires_at: null,
      last_used_at: null,
      revoked_at: null,
    } satisfies ApiKeyCreatedResponse

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
      user_id: 1,
      key_prefix: 'jrn_xyz',
      key: 'jrn_xyz_full_secret_key',
      created_at: '2026-04-14T10:00:00Z',
      expires_at: null,
      last_used_at: null,
      revoked_at: null,
    } satisfies ApiKeyCreatedResponse

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
      user_id: 1,
      key_prefix: 'jrn_xyz',
      key: 'jrn_xyz_full_secret_key',
      created_at: '2026-04-14T10:00:00Z',
      expires_at: null,
      last_used_at: null,
      revoked_at: null,
    } satisfies ApiKeyCreatedResponse

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
          user_id: 1,
          key_prefix: 'jrn_x',
          created_at: '2026-01-15T10:00:00Z',
          last_used_at: null,
          expires_at: null,
          revoked_at: null,
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
