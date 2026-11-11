# Multi-tenant bugfixes

## Email verification spinner flicker
After successful email verification, the component called `authStore.$reset()` + `initialize()`.
`$reset()` set `initialized=false`, causing App.vue's full-page "Loading..." spinner to flash
while the verification view was still mounted. Fixed by fetching `/api/auth/me` directly and
updating `authStore.user` in place, avoiding the intermediate uninitialized state.

## Entry view mode stuck in edit after save
The view-mode watcher watched `store.currentEntry?.id`. When navigating away from an entry and
back, the store still held the previous entry with the same id. The watcher saw no change and
never re-fired, so the stale `viewMode` from the first visit persisted. Fixed by clearing
`currentEntry` to `null` in `onMounted` before calling `loadEntry`, so the watcher sees
`null → id` and re-evaluates.
