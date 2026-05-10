import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import { createRouter, createMemoryHistory, type Router } from 'vue-router'
import StravaCallbackView from '../StravaCallbackView.vue'
import { ApiRequestError } from '@/api/client'

vi.mock('@/api/fitness', () => ({
  exchangeStravaCode: vi.fn(),
}))

import { exchangeStravaCode } from '@/api/fitness'
const mockExchange = vi.mocked(exchangeStravaCode)

function makeRouter(): Router {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      {
        path: '/settings',
        name: 'settings',
        component: { template: '<div />' },
      },
      {
        path: '/settings/fitness/strava/callback',
        name: 'strava-callback',
        component: StravaCallbackView,
      },
    ],
  })
}

async function mountWithQuery(query: Record<string, string>) {
  setActivePinia(createPinia())
  const router = makeRouter()
  const search = new URLSearchParams(query).toString()
  await router.push(`/settings/fitness/strava/callback?${search}`)
  await router.isReady()
  const wrapper = mount(StravaCallbackView, {
    global: { plugins: [router] },
  })
  await flushPromises()
  return { wrapper, router }
}

describe('StravaCallbackView', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders the pending "Connecting Strava…" state while exchange is in flight', async () => {
    // Hold the exchange promise open so the redirect doesn't fire.
    mockExchange.mockReturnValue(new Promise(() => {}))

    setActivePinia(createPinia())
    const router = makeRouter()
    await router.push('/settings/fitness/strava/callback?code=c&state=s')
    await router.isReady()
    const wrapper = mount(StravaCallbackView, {
      global: { plugins: [router] },
    })
    // No flushPromises — keep the pending promise pending.
    expect(
      wrapper.find('[data-testid="strava-callback-pending"]').exists(),
    ).toBe(true)
    expect(wrapper.text()).toContain('Connecting Strava')
  })

  it('exchanges code+state and redirects to /settings#fitness on success', async () => {
    mockExchange.mockResolvedValue({
      connected: true,
      upstream_user_id: '12345',
    })

    const { router } = await mountWithQuery({ code: 'c-1', state: 's-1' })

    expect(mockExchange).toHaveBeenCalledWith({ code: 'c-1', state: 's-1' })
    expect(router.currentRoute.value.path).toBe('/settings')
    expect(router.currentRoute.value.hash).toBe('#fitness')
    expect(router.currentRoute.value.query.strava_error).toBeUndefined()
  })

  it('redirects with the upstream ?error= when the user denies authorization', async () => {
    const { router } = await mountWithQuery({ error: 'access_denied' })

    expect(mockExchange).not.toHaveBeenCalled()
    expect(router.currentRoute.value.path).toBe('/settings')
    expect(router.currentRoute.value.hash).toBe('#fitness')
    expect(router.currentRoute.value.query.strava_error).toBe('access_denied')
  })

  it('redirects with strava_error=missing_params when code or state is absent', async () => {
    const { router } = await mountWithQuery({ code: 'c-only' })

    expect(mockExchange).not.toHaveBeenCalled()
    expect(router.currentRoute.value.query.strava_error).toBe('missing_params')
  })

  it('translates a 403 cross-user state replay into ?strava_error=cross_user_pending_session', async () => {
    mockExchange.mockRejectedValue(
      new ApiRequestError(
        403,
        'cross_user_pending_session',
        'Pending state does not belong to this user.',
        { error: '...', reason: 'cross_user_pending_session' },
      ),
    )

    const { router } = await mountWithQuery({ code: 'c', state: 's' })

    expect(router.currentRoute.value.query.strava_error).toBe(
      'cross_user_pending_session',
    )
  })

  it('translates a 410 expired state into ?strava_error=expired_pending_state', async () => {
    mockExchange.mockRejectedValue(
      new ApiRequestError(410, 'expired_pending_state', 'expired', {
        error: '...',
        reason: 'expired_pending_state',
      }),
    )

    const { router } = await mountWithQuery({ code: 'c', state: 's' })

    expect(router.currentRoute.value.query.strava_error).toBe(
      'expired_pending_state',
    )
  })

  it('falls back to strava_error=exchange_failed when the error has no reason field', async () => {
    mockExchange.mockRejectedValue(new Error('network down'))

    const { router } = await mountWithQuery({ code: 'c', state: 's' })

    expect(router.currentRoute.value.query.strava_error).toBe('exchange_failed')
  })

  it('does nothing on duplicate ?code=&code= (non-string query value)', async () => {
    // URLSearchParams handles duplicate keys as an array on the Vue
    // Router side. Build the URL by hand to exercise that path.
    setActivePinia(createPinia())
    const router = makeRouter()
    await router.push('/settings/fitness/strava/callback?code=a&code=b&state=s')
    await router.isReady()
    mount(StravaCallbackView, { global: { plugins: [router] } })
    await flushPromises()

    expect(mockExchange).not.toHaveBeenCalled()
    expect(router.currentRoute.value.query.strava_error).toBe('missing_params')
  })
})
