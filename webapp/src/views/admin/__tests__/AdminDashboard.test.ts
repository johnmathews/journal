import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createRouter, createWebHistory } from 'vue-router'
import AdminDashboard from '../AdminDashboard.vue'

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

const fakeUsers = [
  {
    id: 1,
    email: 'alice@example.com',
    display_name: 'Alice',
    is_admin: false,
    is_active: true,
    email_verified: true,
    entry_count: 42,
    total_words: 12345,
    job_count: 5,
    cost_estimate: 1.23,
    cost_this_week: 0.45,
    last_entry_at: '2026-04-10T10:00:00Z',
    created_at: '2026-01-01T00:00:00Z',
  },
  {
    id: 2,
    email: 'bob@example.com',
    display_name: 'Bob',
    is_admin: false,
    is_active: false,
    email_verified: false,
    entry_count: 0,
    total_words: 0,
    job_count: 0,
    cost_estimate: 0,
    cost_this_week: 0,
    last_entry_at: null,
    created_at: '2026-02-01T00:00:00Z',
  },
]

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', component: { template: '<div/>' } },
    {
      path: '/admin',
      name: 'admin-dashboard',
      component: AdminDashboard,
    },
  ],
})

function mountComponent() {
  return mount(AdminDashboard, {
    global: {
      plugins: [createPinia(), router],
    },
  })
}

describe('AdminDashboard', () => {
  beforeEach(async () => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    router.push('/admin')
    await router.isReady()
  })

  it('loads and displays users in a table', async () => {
    mockApiFetch.mockResolvedValue({ items: fakeUsers })

    const wrapper = mountComponent()
    await flushPromises()

    expect(mockApiFetch).toHaveBeenCalledWith('/api/admin/users')
    expect(wrapper.text()).toContain('alice@example.com')
    expect(wrapper.text()).toContain('bob@example.com')
    expect(wrapper.text()).toContain('Alice')
    expect(wrapper.text()).toContain('Bob')
  })

  it('shows empty state when no users exist', async () => {
    mockApiFetch.mockResolvedValue({ items: [] })

    const wrapper = mountComponent()
    await flushPromises()

    expect(wrapper.text()).toContain('No users found')
  })

  it('shows error when loading users fails', async () => {
    mockApiFetch.mockRejectedValue(
      new ApiRequestError(500, 'internal', 'Database error'),
    )

    const wrapper = mountComponent()
    await flushPromises()

    expect(wrapper.text()).toContain('Database error')
  })

  it('shows generic error for non-ApiRequestError on load', async () => {
    mockApiFetch.mockRejectedValue(new TypeError('Network error'))

    const wrapper = mountComponent()
    await flushPromises()

    expect(wrapper.text()).toContain('Failed to load users')
  })

  it('displays active/inactive status badges', async () => {
    mockApiFetch.mockResolvedValue({ items: fakeUsers })

    const wrapper = mountComponent()
    await flushPromises()

    // Find all rows — Alice is active (Yes), Bob is inactive (No)
    const rows = wrapper.findAll('tr')
    // First row is header, so data starts at index 1
    expect(rows.length).toBeGreaterThan(2)

    // Check that both Yes and No appear in the table
    const tableText = wrapper.find('table').text()
    expect(tableText).toContain('Yes')
    expect(tableText).toContain('No')
  })

  it('toggles user active status', async () => {
    mockApiFetch.mockResolvedValueOnce({ items: fakeUsers })

    const wrapper = mountComponent()
    await flushPromises()

    // Bob is inactive, button should say "Enable"
    const enableBtn = wrapper
      .findAll('button')
      .find((b) => b.text().includes('Enable'))
    expect(enableBtn).toBeDefined()

    mockApiFetch.mockResolvedValueOnce(undefined)
    await enableBtn!.trigger('click')
    await flushPromises()

    expect(mockApiFetch).toHaveBeenCalledWith('/api/admin/users/2', {
      method: 'PATCH',
      body: JSON.stringify({ is_active: true }),
    })
  })

  it('toggles active user to disabled', async () => {
    mockApiFetch.mockResolvedValueOnce({ items: fakeUsers })

    const wrapper = mountComponent()
    await flushPromises()

    // Alice is active, button should say "Disable"
    const disableBtn = wrapper
      .findAll('button')
      .find((b) => b.text().includes('Disable'))
    expect(disableBtn).toBeDefined()

    mockApiFetch.mockResolvedValueOnce(undefined)
    await disableBtn!.trigger('click')
    await flushPromises()

    expect(mockApiFetch).toHaveBeenCalledWith('/api/admin/users/1', {
      method: 'PATCH',
      body: JSON.stringify({ is_active: false }),
    })
  })

  it('shows error when toggle fails', async () => {
    mockApiFetch.mockResolvedValueOnce({ items: fakeUsers })

    const wrapper = mountComponent()
    await flushPromises()

    mockApiFetch.mockRejectedValueOnce(
      new ApiRequestError(403, 'forbidden', 'Cannot disable yourself'),
    )

    const disableBtn = wrapper
      .findAll('button')
      .find((b) => b.text().includes('Disable'))
    await disableBtn!.trigger('click')
    await flushPromises()

    expect(wrapper.text()).toContain('Cannot disable yourself')
  })

  it('shows generic error for non-ApiRequestError on toggle', async () => {
    mockApiFetch.mockResolvedValueOnce({ items: fakeUsers })

    const wrapper = mountComponent()
    await flushPromises()

    mockApiFetch.mockRejectedValueOnce(new TypeError('Network error'))

    const disableBtn = wrapper
      .findAll('button')
      .find((b) => b.text().includes('Disable'))
    await disableBtn!.trigger('click')
    await flushPromises()

    expect(wrapper.text()).toContain('Failed to update user')
  })

  it('displays job counts', async () => {
    mockApiFetch.mockResolvedValue({ items: fakeUsers })

    const wrapper = mountComponent()
    await flushPromises()

    expect(wrapper.text()).toContain('5')
    expect(wrapper.text()).toContain('0')
  })

  it('displays Never for null last_entry_at', async () => {
    mockApiFetch.mockResolvedValue({ items: fakeUsers })

    const wrapper = mountComponent()
    await flushPromises()

    expect(wrapper.text()).toContain('Never')
  })

  it('displays entry counts', async () => {
    mockApiFetch.mockResolvedValue({ items: fakeUsers })

    const wrapper = mountComponent()
    await flushPromises()

    expect(wrapper.text()).toContain('42')
    expect(wrapper.text()).toContain('12,345')
  })

  it('renders table headers', async () => {
    mockApiFetch.mockResolvedValue({ items: fakeUsers })

    const wrapper = mountComponent()
    await flushPromises()

    const headers = wrapper.findAll('th')
    const headerTexts = headers.map((h) => h.text())
    expect(headerTexts).toContain('Email')
    expect(headerTexts).toContain('Display Name')
    expect(headerTexts).toContain('Active')
    expect(headerTexts).toContain('Verified')
    expect(headerTexts).toContain('Entries')
    expect(headerTexts).toContain('Words')
    expect(headerTexts).toContain('Jobs')
    expect(headerTexts).toContain('Total Cost')
    expect(headerTexts).toContain('Cost (7d)')
    expect(headerTexts).toContain('Last Activity')
    expect(headerTexts).toContain('Actions')
  })
})
