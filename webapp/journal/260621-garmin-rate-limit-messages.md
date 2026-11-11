# 260621 — Garmin Settings card: render rate-limit reasons

Webapp half of the 06-19 Garmin Cloudflare work (server side:
`journal-server/journal/260621-garmin-upstream-cooldown.md` and the
06-19 `260619-garmin-cloudflare-recovery.md`).

## Problem

`GarminConnectionCard.vue`'s `errorMessage()` mapped a handful of server
`reason` codes (`invalid_credentials`, `invalid_mfa_code`, …) to friendly
text and fell through to the raw server message for everything else. The
server's rate-limit reasons — `upstream_rate_limited` (Garmin/Cloudflare
blocked the server IP) and `local_cooldown` (per-email failure counter) —
hit that fallback, so the user got the raw error string with no actionable
"stop retrying and wait" guidance.

## Change

- Added explicit `errorMessage` cases:
  - `upstream_rate_limited` → "Garmin is rate-limiting login attempts from
    this server. Stop retrying and wait … — each attempt re-arms the block.
    If it persists, try again later from a different network."
  - `local_cooldown` → "Too many recent Garmin login attempts for that
    account. Wait … before trying again."
- New `waitHint(seconds)` helper turns the server's `retry_after_seconds`
  into an "about N minutes" clause (ceil to the minute; "about a minute" for
  ≤60s), and omits it entirely when the server sends no countdown.

The credentials form stays open on these errors (existing behaviour) so the
user can retry once the wait is over.

## Tests

`GarminConnectionCard.spec.ts` — three new cases: `upstream_rate_limited`
with a 5-minute hint + "re-arms the block" copy, `local_cooldown` with a
2-minute (90s → ceil) hint, and the no-`retry_after_seconds` path that omits
the hint. 14 passed.

Lint + Prettier clean.
