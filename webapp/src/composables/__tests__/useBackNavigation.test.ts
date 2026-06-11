import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { useBackNavigation } from '../useBackNavigation'

// Mock vue-router so the composable can run outside a component setup.
const back = vi.fn()
const push = vi.fn()
vi.mock('vue-router', () => ({
  useRouter: () => ({ back, push }),
}))

describe('useBackNavigation', () => {
  let originalState: unknown

  beforeEach(() => {
    back.mockClear()
    push.mockClear()
    originalState = window.history.state
  })

  afterEach(() => {
    window.history.replaceState(originalState, '')
  })

  it('calls router.back() when there is in-app history to return to', () => {
    window.history.replaceState({ back: '/storylines/3' }, '')
    const goBack = useBackNavigation({ name: 'entities' })
    goBack()
    expect(back).toHaveBeenCalledTimes(1)
    expect(push).not.toHaveBeenCalled()
  })

  it('falls back to the named route when there is no in-app history', () => {
    // Fresh load / refresh / deep link: history.state.back is null.
    window.history.replaceState({ back: null }, '')
    const goBack = useBackNavigation({ name: 'entities' })
    goBack()
    expect(push).toHaveBeenCalledWith({ name: 'entities' })
    expect(back).not.toHaveBeenCalled()
  })

  it('falls back when history.state itself is null', () => {
    window.history.replaceState(null, '')
    const goBack = useBackNavigation({ name: 'storylines' })
    goBack()
    expect(push).toHaveBeenCalledWith({ name: 'storylines' })
    expect(back).not.toHaveBeenCalled()
  })
})
