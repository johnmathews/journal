# Settings vs Admin rationalization

`SettingsView.vue` had grown into a 52k file mixing per-user preferences with
system-wide operator tooling. Non-admin users could see admin-level controls;
the backend rejected mutations but the UX was misleading. The fix was an
information-architecture re-org:

- `/settings` is now genuinely per-user (Profile + Maintenance + Notifications)
  and reachable by every authenticated user.
- `/admin/*` keeps every system-wide control behind the existing
  `requiresAdmin` guard.

## Resolved questions

**Open Q1 — landing tab.** Picked `Overview` over `Users`. Health and the
total-cost breakdown were previously buried inside `/settings`; promoting
them to the default admin tab puts the most situational-awareness-relevant
information one click from the sidebar. Users tab is one click further but
still visible in the tab bar.

**Open Q2 — author name location.** Moved to `/settings` Profile. The auth
store's `display_name` is the journal author name (one field, two labels in
the old UI), and editing it is a per-user action. The Profile description
mentions both labels so the entity-extraction connection isn't lost.

**Open Q3 — dashboard layout in /settings.** Skipped. The drag-and-drop on
the dashboard works fine; surfacing it in Settings would be a new feature
in the middle of a re-org.

**Open Q4 — `/jobs` mixed-use.** Out of scope, flagged as follow-up.

**WU13 — Maintenance buttons.** `POST /api/mood/backfill` and
`POST /api/entities/extract` are both scoped to the caller's `user_id`,
not admin-gated. They're per-user maintenance, not system actions, so they
stay in `/settings` under a new "Maintenance" section rather than moving
to `/admin/runtime`.

## Final structure

| Route | Component | Holds |
|---|---|---|
| `/settings` | `SettingsView.vue` | Profile (display name, with re-extract prompt), Maintenance (Mood Backfill + Entity Extraction), Notifications |
| `/admin` | `AdminOverview.vue` *(new)* | Health card, Total Cost card, quick-link grid |
| `/admin/users` | `AdminDashboard.vue` *(renamed route)* | Users table (unchanged) |
| `/admin/runtime` | `AdminRuntimeView.vue` *(new)* | Runtime toggles + read-only pipeline sub-cards |
| `/admin/pricing` | `AdminPricingView.vue` *(new)* | API Pricing editor |
| `/admin/server` | `AdminServerView.vue` *(unchanged)* | File-backed reloads |

## Notes

- Route name `admin-dashboard` → `admin-users`; default child route name
  `''` is now `admin-overview`. Grepped for stale callers and updated the
  AdminLayout tab-bar lookup.
- `AppSidebar` and `AppHeader` Admin links still point at `/admin`; they
  now land users on Overview rather than the Users table. Same single
  surface, more useful default.
- `useSettingsStore` was kept intact — the four extracted views all import
  it. The split is purely presentational, so each view's `onMounted`
  triggers `store.load()` and they share the same reactive state.
- The `transcript_formatting` runtime setting is filtered out of the
  Runtime tab's toggle list and surfaced in the Audio sub-card instead,
  immediately next to the formatting model that depends on it. This was
  the existing behaviour in `SettingsView`; preserved to keep the toggle
  adjacent to its dependent display.
- The total-cost card lives on Overview rather than Runtime because cost
  is the kind of summary an operator wants to see at a glance, not while
  drilling into individual sub-card settings.

## Tests

- `SettingsView.test.ts` rewritten to cover only Profile + Maintenance +
  removed-section assertions.
- New per-view test files: `AdminOverview.test.ts`, `AdminRuntimeView.test.ts`,
  `AdminPricingView.test.ts`. Together they cover the moved code paths so
  the re-org is coverage-neutral.
- `AdminLayout.test.ts` updated to assert the five-tab order and the
  active-tab highlight on both `/admin` (Overview) and `/admin/users`.
- `AdminDashboard.test.ts` and the router guard test were updated to use
  the renamed route names / paths.
