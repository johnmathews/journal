/**
 * Router navigation guard tests.
 *
 * Regression: authenticated users were previously redirected away from
 * /verify-email because the guard treated ALL public routes the same.
 * The user would click the verification link in their email, get redirected
 * to the dashboard, and the VerifyEmailView never mounted — so the token
 * was never sent to the server and email_verified stayed false.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createPinia, setActivePinia, defineStore } from 'pinia'

// We need to mock the auth store BEFORE importing the router, because
// the router module imports useAuthStore at the top level.
const mockAuthState = {
  initialized: true,
  isAuthenticated: false,
  isAdmin: false,
}

vi.mock('@/stores/auth', () => ({
  useAuthStore: defineStore('auth', {
    state: () => ({ ...mockAuthState }),
    getters: {
      // The real store uses computed refs; the router guard accesses
      // these as plain properties on the store instance.
    },
    actions: {
      async initialize() {
        this.initialized = true
      },
    },
  }),
}))

// Stub out all lazy-loaded view components so the router doesn't
// try to import real Vue SFCs (which need the full build pipeline).
vi.mock('@/views/LoginView.vue', () => ({ default: { template: '<div/>' } }))
vi.mock('@/views/RegisterView.vue', () => ({ default: { template: '<div/>' } }))
vi.mock('@/views/ForgotPasswordView.vue', () => ({ default: { template: '<div/>' } }))
vi.mock('@/views/ResetPasswordView.vue', () => ({ default: { template: '<div/>' } }))
vi.mock('@/views/VerifyEmailView.vue', () => ({ default: { template: '<div/>' } }))
vi.mock('@/views/DashboardView.vue', () => ({ default: { template: '<div/>' } }))
vi.mock('@/views/EntryListView.vue', () => ({ default: { template: '<div/>' } }))
vi.mock('@/views/CreateEntryView.vue', () => ({ default: { template: '<div/>' } }))
vi.mock('@/views/EntryDetailView.vue', () => ({ default: { template: '<div/>' } }))
vi.mock('@/views/SearchView.vue', () => ({ default: { template: '<div/>' } }))
vi.mock('@/views/EntityListView.vue', () => ({ default: { template: '<div/>' } }))
vi.mock('@/views/EntityDetailView.vue', () => ({ default: { template: '<div/>' } }))
vi.mock('@/views/JobHistoryView.vue', () => ({ default: { template: '<div/>' } }))
vi.mock('@/views/SettingsView.vue', () => ({ default: { template: '<div/>' } }))
vi.mock('@/views/ApiKeysView.vue', () => ({ default: { template: '<div/>' } }))
vi.mock('@/views/admin/AdminLayout.vue', () => ({ default: { template: '<div><router-view/></div>' } }))
vi.mock('@/views/admin/AdminDashboard.vue', () => ({ default: { template: '<div/>' } }))

import router from '../index'
import { useAuthStore } from '@/stores/auth'

describe('Router navigation guard', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  afterEach(async () => {
    // Reset router to a known state
    await router.push('/')
  })

  function setAuth(overrides: Partial<typeof mockAuthState>) {
    const store = useAuthStore()
    Object.assign(store, { ...mockAuthState, ...overrides })
  }

  it('allows authenticated users to access /verify-email', async () => {
    setAuth({ isAuthenticated: true, initialized: true })

    await router.push('/verify-email?token=test123')
    await router.isReady()

    // Regression: previously redirected to dashboard
    expect(router.currentRoute.value.name).toBe('verify-email')
    expect(router.currentRoute.value.query.token).toBe('test123')
  })

  it('redirects authenticated users away from /login', async () => {
    setAuth({ isAuthenticated: true, initialized: true })

    await router.push('/login')
    await router.isReady()

    expect(router.currentRoute.value.name).toBe('dashboard')
  })

  it('redirects authenticated users away from /register', async () => {
    setAuth({ isAuthenticated: true, initialized: true })

    await router.push('/register')
    await router.isReady()

    expect(router.currentRoute.value.name).toBe('dashboard')
  })

  it('redirects unauthenticated users from protected routes to login', async () => {
    setAuth({ isAuthenticated: false, initialized: true })

    await router.push('/entries')
    await router.isReady()

    expect(router.currentRoute.value.name).toBe('login')
    expect(router.currentRoute.value.query.redirect).toBe('/entries')
  })

  it('allows unauthenticated users to access /verify-email', async () => {
    setAuth({ isAuthenticated: false, initialized: true })

    await router.push('/verify-email?token=test123')
    await router.isReady()

    expect(router.currentRoute.value.name).toBe('verify-email')
  })
})
