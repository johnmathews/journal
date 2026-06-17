import { describe, it, expect, vi } from 'vitest'

vi.mock('@/views/ConversationListView.vue', () => ({
  default: { template: '<div/>' },
}))
vi.mock('@/views/ConversationView.vue', () => ({
  default: { template: '<div/>' },
}))

import router from '../index'

describe('conversations routes', () => {
  it('resolves the list route', () => {
    const r = router.resolve('/conversations')
    expect(r.name).toBe('conversations')
  })
  it('resolves the detail route', () => {
    const r = router.resolve('/conversations/5')
    expect(r.name).toBe('conversation')
    expect(r.params.id).toBe('5')
  })
})
