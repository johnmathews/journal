# W11 (webapp side) — FitnessAuthBanner Reconnect button

Date: 2026-05-10
Plan: `../server/docs/fitness-multiuser-plan.md` §5 W11.

## What W11 says (recap)

> The existing `FitnessAuthBanner.vue` directs broken users to CLI commands. Change the
> CTA to a "Reconnect" button that routes to `/settings#fitness`.

## What this commit changes

`src/components/FitnessAuthBanner.vue`:

1. **Removed the per-source CLI hint** — no more `journal fitness-reauth-strava` /
   `journal fitness-reauth-garmin` rendered into the banner. The CLI is still a valid
   operator fallback (documented in `server/docs/fitness-operations.md`) but is no longer
   the path the banner pushes ordinary users toward.
2. **Removed the `docs/fitness-operations.md §2` link.** Same reason — those docs are
   for operators, not for the user staring at a broken-sync banner.
3. **Added a single `Reconnect` button** as a sibling to the broken-source list. The
   button is a `RouterLink` to `{ path: '/settings', hash: '#fitness' }`, hitting the
   section anchor W9 already exposes. One button rather than per-source because the
   settings panel already has per-source Reconnect affordances inline (W9's
   `GarminConnectionCard` / `StravaConnectionCard`) — the banner's job is to get the
   user to the panel, not to dispatch per-source.
4. **Updated comment block** to reflect the new posture: history note about the CLI
   guidance the banner used to surface, plus a pointer to the W11 server-side worker
   test that guards the `auth_status='broken'` flip.

Layout is unchanged otherwise: rose-tinted banner across the top, source-specific
explanation text, and the alert icon. The new Reconnect button sits to the right of
the message on wide viewports and wraps below on narrow ones via `flex-wrap`.

## Test changes

`src/components/__tests__/FitnessAuthBanner.spec.ts`:

1. Replaced the two "renders CLI command" assertions (`journal fitness-reauth-strava` /
   `journal fitness-reauth-garmin`) with "per-source explanation line" assertions that
   just check the source name and "Reconnect" copy appear.
2. Replaced the `docs/fitness-operations.md §2` assertion with a regression test that
   *negatively* asserts the old CLI string and operations-doc path are gone — so a
   future revert would be caught.
3. Added a `Reconnect button links to /settings#fitness` test that uses Vue Test
   Utils to assert the RouterLink renders as `<a href="/settings#fitness">`.
4. Mount helper now installs a vue-router instance with a `/settings` route so
   RouterLink resolves.

7 tests pass (was 6 before the rewrite — net +1 from splitting the CLI-string
assertion into separate Reconnect-presence and copy-cleanup tests).

## Companion change (server side)

The server half of W11 — verification that sync workers actually flip
`fitness_auth_state.auth_status` to `'broken'` on a provider 401, plus a worker-level
regression test for that wiring — ships as a separate commit on the server repo. See
`server/journal/260510-fitness-multiuser-w11-server-broken-flip-test.md`.

The flip already worked in production; the verification confirms it and the new test
guards the worker-fetch seam.

## Numbers

- 1444 → 1445 tests (+1).
- `npm run lint`, `npm run test:coverage`, `npm run build` all green.
- Project coverage holds at 91.48% statements / 85.18% branches / 89.04% functions /
  93.58% lines — all ≥85%.

## What's left in the multi-user plan

W4 (per-user integrity), W6 (drop Garmin env vars), W7 (CLI `--user-id` required),
W12 (docs sweep), W13 (operator step), W14 (end-to-end verification with user 2).
