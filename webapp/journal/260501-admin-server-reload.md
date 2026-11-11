# Admin server reload UI

## What shipped

A new admin-only view at `/admin/server` (sibling to `/admin` Users) with
three reload buttons that hit the server's new admin reload endpoints:

- `POST /api/admin/reload/ocr-context`
- `POST /api/admin/reload/transcription-context`
- `POST /api/admin/reload/mood-dimensions`

Each section renders the server's JSON summary inline (provider, stack
description, dimension list, file/char counts, timestamp) so the
operator can confirm the reload landed without tailing logs. Errors
surface the `ApiRequestError.message` directly (e.g. the 409 "mood
scoring is disabled" message rendered verbatim).

The route is added under the existing `AdminLayout` (which already has
`requiresAdmin: true` enforced by the router guard), and a new "Server"
tab links to it from the layout's tab bar. Non-admin users get
redirected to `/` by the existing route guard before the view ever
mounts.

## Why this design

- **Sibling to Users, not in Settings.** Settings is for personal
  preferences (theme, dashboard layout, dimension toggles). Server
  reload is operator action against shared state — it lives with other
  admin tools. The team discussed Settings vs. `AdminDashboard` vs. a
  new sibling and picked the sibling because it keeps the Users
  dashboard focused and gives Server room to grow if more controls
  land later.
- **No Pinia store.** Reload is a one-off, fire-and-forget operator
  action with no shared state to coordinate. Local `ref` state in the
  component is enough.
- **Inline summary, not a toast.** A toast would dismiss before the
  operator could read the dimension list / stack description. The
  inline card stays put until the operator triggers the next reload.
- **One file, three sections.** Considered a `<ReloadCard>` child
  component, but with only one call site the abstraction would just
  add indirection. Three near-duplicate sections is fine.

## Tests

- `src/views/admin/__tests__/AdminServerView.test.ts` — 9 tests
  covering: all three sections render, each button triggers the right
  API call, summaries render, dual-pass marker appears when reported,
  `ApiRequestError.message` shows up on failure, generic fallback
  shows up on non-API errors, button disables during in-flight
  request, stale error clears on successful retry.
- `src/views/admin/__tests__/AdminLayout.test.ts` — added one
  assertion that the Server tab link points to `/admin/server`.

Coverage: AdminServerView.vue is at 100% statements/functions/lines
(97.87% branches). Webapp totals stay well above the 85% pre-push
thresholds.

## Server-side companion

Endpoints + helpers live in journal-server. See
`journal-server/journal/260501-live-reload.md` for the design rationale
on the helper module, in-flight semantics, and why OCR / transcription
deliberately don't share a reload.
