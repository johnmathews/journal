/** Recovery for stale-chunk navigation failures after a deploy.
 *
 * Every route is lazy-loaded and each build fingerprints its chunks. A tab
 * that loaded the app before a deploy holds the old chunk map; navigating
 * to a not-yet-visited route then 404s on the dynamic import and Vue
 * Router aborts the navigation with an unhandled error — the tap/click
 * silently does nothing until the user refreshes (seen on iPhone Safari,
 * 2026-07-13, `GET /assets/StorylineListView-*.js → 404`).
 *
 * The fix: on a chunk-load error, hard-navigate to the target path so the
 * browser fetches the fresh `index.html` (served no-cache) and the new
 * chunk map. A per-path sessionStorage flag prevents a reload loop when
 * the failure is persistent (e.g. actually offline); the flag is cleared
 * on any successful navigation so the *next* deploy can recover again.
 */

const RELOAD_FLAG_PREFIX = 'chunk-reload:'

const CHUNK_ERROR_RE =
  /failed to fetch dynamically imported module|error loading dynamically imported module|importing a module script failed/i

interface ReloadFlagStorage {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
}

export function isChunkLoadError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : ''
  return CHUNK_ERROR_RE.test(message)
}

/** Handle a router error; returns true when a reload was triggered. */
export function handleRouterError(
  error: unknown,
  targetPath: string,
  storage: ReloadFlagStorage = sessionStorage,
  reload: (path: string) => void = (path) => window.location.assign(path),
): boolean {
  if (!isChunkLoadError(error)) return false
  const key = RELOAD_FLAG_PREFIX + targetPath
  if (storage.getItem(key) !== null) {
    // Already tried once for this path this session — a reload didn't
    // fix it, so don't loop.
    return false
  }
  storage.setItem(key, String(Date.now()))
  reload(targetPath)
  return true
}

/** Clear the reload flag after a successful navigation to the path. */
export function clearReloadFlag(
  targetPath: string,
  storage: ReloadFlagStorage = sessionStorage,
): void {
  storage.removeItem(RELOAD_FLAG_PREFIX + targetPath)
}
