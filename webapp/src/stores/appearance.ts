import { defineStore } from 'pinia'
import { ref } from 'vue'
import { fetchPreferences, updatePreferences } from '@/api/preferences'
import {
  ACCENTS,
  DEFAULT_ACCENT,
  isAccentId,
  type AccentId,
} from '@/brand/accents'
import { iconDir } from '@/brand/appIcon'

/** The user preference that holds the accent id (`PATCH /api/users/me/preferences`). */
export const ACCENT_PREFERENCE = 'accent'

/**
 * The local copy of the accent, read by the inline script in index.html so the page paints in the
 * user's colour before the app (and the preference request) has loaded.
 */
export const ACCENT_STORAGE_KEY = 'accent'

export type SaveState = 'idle' | 'saving' | 'saved' | 'error'

function readCached(): AccentId {
  try {
    const value = localStorage.getItem(ACCENT_STORAGE_KEY)
    return isAccentId(value) ? value : DEFAULT_ACCENT
  } catch {
    return DEFAULT_ACCENT
  }
}

/**
 * Point the page's icon links (`link[data-icon]` in index.html) at the accent's icon set and the
 * theme colour at its swatch, so the tab icon, a newly added home-screen icon and the browser
 * chrome match the accent.
 */
function paintIcons(id: AccentId): void {
  for (const link of document.querySelectorAll<HTMLLinkElement>(
    'link[data-icon]',
  )) {
    link.href = `${iconDir(id)}/${link.dataset.icon}`
  }
  const swatch = ACCENTS.find((a) => a.id === id)?.swatch
  const theme = document.querySelector<HTMLMetaElement>(
    'meta[name="theme-color"]',
  )
  if (theme && swatch) theme.content = swatch
}

/** Set `data-accent` on <html> (src/assets/accents.css), the icons, and the local copy. */
function paint(id: AccentId): void {
  document.documentElement.dataset.accent = id
  paintIcons(id)
  try {
    if (id === DEFAULT_ACCENT) localStorage.removeItem(ACCENT_STORAGE_KEY)
    else localStorage.setItem(ACCENT_STORAGE_KEY, id)
  } catch {
    // Storage blocked: the colour still applies for this page view.
  }
}

/** The user's accent colour: loaded from their preferences, saved back when they pick one. */
export const useAppearanceStore = defineStore('appearance', () => {
  const accent = ref<AccentId>(readCached())
  const saveState = ref<SaveState>('idle')
  /** The last accent the account is known to hold: what a failed pick goes back to. */
  let saved: AccentId = accent.value
  /** Counts picks and resets, so a load that was out during one can tell. */
  let changes = 0
  /** Counts confirmed saves, so a load that was out during one doesn't overwrite `saved`. */
  let confirmations = 0

  /** Load the signed-in user's accent. A missing or unknown value means the default. */
  async function load(): Promise<void> {
    const changesAtStart = changes
    const confirmationsAtStart = confirmations
    try {
      const { preferences } = await fetchPreferences()
      const raw = preferences[ACCENT_PREFERENCE]
      const value = isAccentId(raw) ? raw : DEFAULT_ACCENT
      if (confirmations === confirmationsAtStart) saved = value
      // A pick made while the request was out is newer than its answer.
      if (changes !== changesAtStart) return
      accent.value = value
      paint(value)
    } catch {
      // Keep the cached colour; the next load or pick will correct it.
    }
  }

  /** Apply an accent at once and save it to the account; on failure, go back to the saved one. */
  async function setAccent(id: AccentId): Promise<void> {
    if (id === accent.value) return
    changes += 1
    accent.value = id
    paint(id)
    saveState.value = 'saving'
    try {
      await updatePreferences({ [ACCENT_PREFERENCE]: id })
      saved = id
      confirmations += 1
      if (accent.value === id) saveState.value = 'saved'
    } catch {
      if (accent.value === id) {
        accent.value = saved
        paint(saved)
        saveState.value = 'error'
      }
    }
  }

  /** Back to the default, for sign-out, so the next person on this browser starts in violet. */
  function reset(): void {
    changes += 1
    saved = DEFAULT_ACCENT
    accent.value = DEFAULT_ACCENT
    saveState.value = 'idle'
    paint(DEFAULT_ACCENT)
  }

  return { accent, saveState, load, setAccent, reset }
})
