import { describe, it, expect, vi, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'

vi.mock('@/api/preferences', () => ({
  fetchPreferences: vi.fn(),
  updatePreferences: vi.fn(),
}))

import { fetchPreferences, updatePreferences } from '@/api/preferences'
import {
  ACCENT_PREFERENCE,
  ACCENT_STORAGE_KEY,
  useAppearanceStore,
} from '@/stores/appearance'

const mockFetch = vi.mocked(fetchPreferences)
const mockUpdate = vi.mocked(updatePreferences)

describe('appearance store', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
    delete document.documentElement.dataset.accent
    // The icon links and theme colour index.html carries.
    document.head.innerHTML =
      '<link rel="icon" href="/icons/violet/favicon.svg" data-icon="favicon.svg">' +
      '<link rel="manifest" href="/icons/violet/manifest.webmanifest" data-icon="manifest.webmanifest">' +
      '<meta name="theme-color" content="#8470ff">'
    setActivePinia(createPinia())
  })

  const iconHrefs = () =>
    [...document.querySelectorAll<HTMLLinkElement>('link[data-icon]')].map(
      (l) => l.getAttribute('href'),
    )
  const themeColour = () =>
    document.querySelector<HTMLMetaElement>('meta[name="theme-color"]')!.content

  it('starts in violet with nothing cached', () => {
    expect(useAppearanceStore().accent).toBe('violet')
  })

  it('starts in the cached accent, so it matches what index.html painted', () => {
    localStorage.setItem(ACCENT_STORAGE_KEY, 'green')
    expect(useAppearanceStore().accent).toBe('green')
  })

  it('ignores an unknown cached value', () => {
    localStorage.setItem(ACCENT_STORAGE_KEY, 'chartreuse')
    expect(useAppearanceStore().accent).toBe('violet')
  })

  it('load applies the saved preference to <html> and caches it', async () => {
    mockFetch.mockResolvedValue({
      preferences: { [ACCENT_PREFERENCE]: 'emerald' },
    })
    const store = useAppearanceStore()
    await store.load()
    expect(store.accent).toBe('emerald')
    expect(document.documentElement.dataset.accent).toBe('emerald')
    expect(localStorage.getItem(ACCENT_STORAGE_KEY)).toBe('emerald')
  })

  it('load falls back to violet when the preference is missing or unknown', async () => {
    localStorage.setItem(ACCENT_STORAGE_KEY, 'green')
    mockFetch.mockResolvedValue({ preferences: { [ACCENT_PREFERENCE]: 42 } })
    const store = useAppearanceStore()
    await store.load()
    expect(store.accent).toBe('violet')
    expect(document.documentElement.dataset.accent).toBe('violet')
    // The default is not cached: index.html then paints nothing and CSS falls back to violet.
    expect(localStorage.getItem(ACCENT_STORAGE_KEY)).toBeNull()
  })

  it('load keeps the cached accent when the request fails', async () => {
    localStorage.setItem(ACCENT_STORAGE_KEY, 'blue')
    mockFetch.mockRejectedValue(new Error('offline'))
    const store = useAppearanceStore()
    await store.load()
    expect(store.accent).toBe('blue')
  })

  it('setAccent applies at once and saves to the account', async () => {
    mockUpdate.mockResolvedValue({
      preferences: { [ACCENT_PREFERENCE]: 'rose' },
    })
    const store = useAppearanceStore()
    const done = store.setAccent('rose')
    expect(document.documentElement.dataset.accent).toBe('rose')
    expect(store.saveState).toBe('saving')
    await done
    expect(mockUpdate).toHaveBeenCalledWith({ [ACCENT_PREFERENCE]: 'rose' })
    expect(store.saveState).toBe('saved')
    expect(localStorage.getItem(ACCENT_STORAGE_KEY)).toBe('rose')
  })

  it('the tab icon, manifest and theme colour follow the accent', async () => {
    mockUpdate.mockResolvedValue({ preferences: {} })
    const store = useAppearanceStore()
    await store.setAccent('green')
    expect(iconHrefs()).toEqual([
      '/icons/green/favicon.svg',
      '/icons/green/manifest.webmanifest',
    ])
    expect(themeColour()).toBe('#15803d')
    store.reset()
    expect(iconHrefs()).toEqual([
      '/icons/violet/favicon.svg',
      '/icons/violet/manifest.webmanifest',
    ])
    expect(themeColour()).toBe('#8470ff')
  })

  it('setAccent puts the previous accent back when the save fails', async () => {
    mockUpdate.mockRejectedValue(new Error('500'))
    const store = useAppearanceStore()
    await store.setAccent('graphite')
    expect(store.accent).toBe('violet')
    expect(document.documentElement.dataset.accent).toBe('violet')
    expect(store.saveState).toBe('error')
  })

  it('setAccent does nothing for the accent already chosen', async () => {
    const store = useAppearanceStore()
    await store.setAccent('violet')
    expect(mockUpdate).not.toHaveBeenCalled()
    expect(store.saveState).toBe('idle')
  })

  it('a slow failed save does not undo a newer pick', async () => {
    let fail: (e: Error) => void = () => {}
    mockUpdate
      .mockImplementationOnce(() => new Promise((_, reject) => (fail = reject)))
      .mockResolvedValueOnce({ preferences: {} })
    const store = useAppearanceStore()
    const first = store.setAccent('green')
    await store.setAccent('blue')
    fail(new Error('timeout'))
    await first
    expect(store.accent).toBe('blue')
    expect(document.documentElement.dataset.accent).toBe('blue')
  })

  it('a pick made while the saved accent loads is not undone by it', async () => {
    let answer: (v: { preferences: Record<string, unknown> }) => void = () => {}
    mockFetch.mockImplementationOnce(
      () => new Promise((resolve) => (answer = resolve)),
    )
    mockUpdate.mockResolvedValue({ preferences: {} })
    const store = useAppearanceStore()
    const loading = store.load()
    await store.setAccent('blue')
    answer({ preferences: { [ACCENT_PREFERENCE]: 'violet' } })
    await loading
    expect(store.accent).toBe('blue')
    expect(document.documentElement.dataset.accent).toBe('blue')
    expect(store.saveState).toBe('saved')
  })

  it('a failed pick goes back to the last accent the account saved', async () => {
    const fails: Array<(e: Error) => void> = []
    mockUpdate.mockImplementation(
      () => new Promise((_, reject) => fails.push(reject)),
    )
    const store = useAppearanceStore()
    const green = store.setAccent('green')
    const rose = store.setAccent('rose')
    fails[0](new Error('offline'))
    await green
    fails[1](new Error('offline'))
    await rose
    // Green failed too, so the account still holds violet.
    expect(store.accent).toBe('violet')
    expect(document.documentElement.dataset.accent).toBe('violet')
    expect(localStorage.getItem(ACCENT_STORAGE_KEY)).toBeNull()
    expect(store.saveState).toBe('error')
  })

  it('reverts to an accent saved earlier in the session', async () => {
    mockUpdate
      .mockResolvedValueOnce({ preferences: {} })
      .mockRejectedValueOnce(new Error('offline'))
    const store = useAppearanceStore()
    await store.setAccent('green')
    await store.setAccent('rose')
    expect(store.accent).toBe('green')
  })

  it('reset returns to violet and clears the cache', async () => {
    mockUpdate.mockResolvedValue({ preferences: {} })
    const store = useAppearanceStore()
    await store.setAccent('green')
    store.reset()
    expect(store.accent).toBe('violet')
    expect(document.documentElement.dataset.accent).toBe('violet')
    expect(localStorage.getItem(ACCENT_STORAGE_KEY)).toBeNull()
  })
})
