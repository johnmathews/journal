# 1. Stacked-card rollout to list views + notch-safe public pages

**Date:** 2026-06-16

Follow-up to [`260616-mobile-safe-area-and-storyline-cards.md`](./260616-mobile-safe-area-and-storyline-cards.md).
After storylines shipped, rolled the two patterns out across the app.

## 1.1 Scope (user decisions)

- **Card rollout:** the three primary content lists — `EntryListView`,
  `EntityListView`, `JobHistoryView`. Left as tables: `FitnessView` (dashboard
  tiles), `ApiKeysView` (settings sub-table), `admin/AdminDashboard`.
- **EntryListView card:** respect the user's column prefs — Date + Source as the
  headline, remaining *visible* columns as a meta grid in the chosen order (new
  `cardMetaColumns` computed). Not a fixed subset.
- **Notch-safe everywhere:** public routes too.

## 1.2 What changed

- **Public pages notch-safe:** login, register, forgot/reset password, verify
  email render outside `DefaultLayout` (`App.vue` `isPublicRoute` branch), so they
  never got the shell's safe-area handling. Added
  `pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]` to each view's
  full-bleed `min-h-[100dvh]` centered-card root (bg fills, card insets). One
  scripted edit across all five since they shared an identical root class.
- **Cards:** each of the three views now has `hidden sm:block` table +
  `sm:hidden` card list, reusing existing data/handlers.

## 1.3 Test gotchas (all cost a red run before going green)

1. **happy-dom renders both branches.** Card elements must use distinct
   `data-testid`s — several existing tests `.toHaveLength()` on `entry-row` /
   `entity-checkbox` / `entity-row`, which would double-count if reused. Used
   `entry-card`, `entity-card`, `entity-card-checkbox`, `job-card-*`,
   `card-entry-link`, etc.
2. **Attribute-prefix selector over-matched:** `[data-testid^="job-card-"]` also
   matched the container `job-card-list`. Switched to counting the list's `<li>`.
3. **Appended tests inherit the nearest `describe`'s setup.** Two cases bit:
   - EntityListView — earlier tests mutate the module-level `fetchEntities` mock
     with persistent `mockResolvedValue`, so appended tests saw stale data. Fixed
     by giving the card tests their own `mountWithEntities()` that sets the mock.
   - EntryListView — the file is a series of *sibling* top-level `describe`s; my
     tests landed inside `describe('Column order')` (seeds 1 entry), so counts
     were wrong. Moved them into a new top-level
     `describe('EntryListView mobile cards')` with a 2-entry `beforeEach`.

## 1.4 Verification

- Suite: **1843 tests pass** (+15 across the four files). Coverage above the 85%
  gates (statements 92.1 / branches 85.9 / functions 90.8 / lines 94.3). Lint +
  build clean.
- Deployed to prod (`ssh media`, `/srv/media`, `docker compose pull/up -d
  journal-webapp`).
- On-device (notch + cards) still needs an eyeball on a real phone — `env()`
  insets are 0 in headless Chromium.

## 1.5 Follow-up (not done)

`FitnessView` / `ApiKeysView` / `admin/AdminDashboard` still tables on mobile
(deliberately out of scope). Still open from the first entry: a shared
`<TableScroll>` / base-table primitive, and now also a possible shared card
primitive given four near-identical implementations.
