import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest'

import {
  clearReloadFlag,
  handleRouterError,
  isChunkLoadError,
} from '../chunkReload'

/** Minimal in-memory stand-in for sessionStorage. */
function makeStorage() {
  const map = new Map<string, string>()
  return {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
    removeItem: (k: string) => void map.delete(k),
  }
}

describe('isChunkLoadError', () => {
  it.each([
    'Failed to fetch dynamically imported module: https://x/assets/StorylineListView-BAoTIpTu.js',
    'error loading dynamically imported module',
    'Importing a module script failed.',
  ])('detects chunk-load failures: %s', (message) => {
    expect(isChunkLoadError(new TypeError(message))).toBe(true)
  })

  it('ignores unrelated errors', () => {
    expect(
      isChunkLoadError(new Error('Cannot read properties of undefined')),
    ).toBe(false)
    expect(isChunkLoadError('some string')).toBe(false)
    expect(isChunkLoadError(undefined)).toBe(false)
  })
})

describe('handleRouterError', () => {
  const chunkError = new TypeError(
    'Failed to fetch dynamically imported module: https://x/assets/View-abc.js',
  )
  let storage: ReturnType<typeof makeStorage>
  let reload: Mock<(path: string) => void>

  beforeEach(() => {
    storage = makeStorage()
    reload = vi.fn<(path: string) => void>()
  })

  it('hard-reloads to the target path on a chunk-load error', () => {
    const handled = handleRouterError(
      chunkError,
      '/storylines',
      storage,
      reload,
    )
    expect(handled).toBe(true)
    expect(reload).toHaveBeenCalledWith('/storylines')
  })

  it('only reloads once per path — no reload loop on a persistent failure', () => {
    handleRouterError(chunkError, '/storylines', storage, reload)
    const second = handleRouterError(chunkError, '/storylines', storage, reload)
    expect(second).toBe(false)
    expect(reload).toHaveBeenCalledTimes(1)
  })

  it('does not touch non-chunk errors', () => {
    const handled = handleRouterError(
      new Error('boom'),
      '/storylines',
      storage,
      reload,
    )
    expect(handled).toBe(false)
    expect(reload).not.toHaveBeenCalled()
  })

  it('a successful navigation clears the flag so a later deploy can reload again', () => {
    handleRouterError(chunkError, '/storylines', storage, reload)
    clearReloadFlag('/storylines', storage)
    const again = handleRouterError(chunkError, '/storylines', storage, reload)
    expect(again).toBe(true)
    expect(reload).toHaveBeenCalledTimes(2)
  })
})
