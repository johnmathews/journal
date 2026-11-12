# API key expiry (#40) and webapp Dependabot alerts (#41)

**Date:** 2026-11-12

## 1. #40: API key expiry was silently dropped

### 1.1 What was wrong

- **Confirmed (read and tested):** the API Keys page sent `expires_at: "YYYY-MM-DD"`. `POST /api/auth/api-keys` read
  only `expires_days` and ignored unknown fields, so every key created with an expiry was stored with none.
- **Confirmed (red test):** expiry enforcement was a string comparison, `expires_at > datetime('now')`. Stored values
  look like `2026-11-12T01:00:00Z` and `datetime('now')` like `2026-11-12 08:50:00`. On the expiry date `'T' > ' '`,
  so an API key or a session stayed valid until the end of that UTC day. `test_expired_api_key_is_rejected_by_middleware`
  got 200 for a bearer key one second past expiry.

### 1.2 What changed

- The server accepts `expires_at`: an ISO 8601 date-time with a time zone, in the future, stored in UTC to the second.
  `expires_days` still works. Both together, any unknown field, or a non-object body is a 400.
- The webapp sends the end of the chosen day in the browser's time zone (`23:59:59` local, as UTC), and the date
  picker no longer offers past dates.
- The three expiry comparisons (API key lookup, session lookup, session cleanup) wrap the stored value in `datetime()`.
- `expires_days` is capped at 36500. An out-of-range or infinite value used to raise `OverflowError` and return a 500
  (found by the independent review; red test `assert 500 == 400`).
- `server/docs/api.md` documents the request body. The docs audit also fixed stale claims next to it: the response
  example's `expires_at` format and `jrnl_` prefix, `docs/api-contract.md` citing #40 as still open, and
  `security-roadmap.md` §13 and `configuration.md` saying session cleanup never runs (it runs on every login).

### 1.3 Decisions

- **The server changed, not only the webapp.** Converting the date to `expires_days` in the browser would have kept
  the server API as it was, but it rounds to whole days counted from creation time, and every API or MCP caller would
  have had to do the same arithmetic. An absolute instant is what a user means by "expires on".
- **Unknown fields are rejected.** Silently ignoring one is the root cause of #40. The only known caller is the webapp.
- **A bare date is rejected.** Without a zone the instant is ambiguous; the browser knows the user's zone, the server
  does not.
- **Sessions got the same SQL fix.** Same root cause, same file, a one-word change each.

### 1.4 Evidence

- Red before the fix: the round-trip test (`assert None == '2026-11-22T08:53:51Z'`), the middleware test
  (`assert 200 == 401`), the same-day repository tests for keys and sessions, the non-object body (500), and the
  webapp body and `min` tests.
- Local stack on a copy of the dev DB: a key set in the UI to expire on 2026-11-30 came back from
  `GET /api/auth/api-keys` as `2026-11-30T22:59:59Z` (23:59:59 CET).
- Prod probe (read-only, counts only): 3 sessions, all `expires_at` in `YYYY-MM-DDTHH:MM:SSZ`, none unparsable by
  `datetime()`, so the SQL change fails no existing session closed. 4 API keys, all active, none with an expiry.

## 2. #41: 16 Dependabot alerts in the webapp

### 2.1 What reaches prod

- **Confirmed:** none of the 16. The final image stage is `nginx:alpine` serving `dist/` only.
  - `npm ls --omit=dev` found two of the packages in the production tree: `source-map-js`, used only at build time,
    and `@vue/server-renderer`, which the app never imports (no SSR).
  - A grep of `dist/` found neither.
  - After this work, `npm audit --omit=dev` reports 0 vulnerabilities.
- The rest is dev and CI tooling: vite, vitest, happy-dom, brace-expansion and minimatch.

### 2.2 What was done

- **Dependabot PR #33 merged** (`2be2fe7`, 10:34 CET): vue 3.5.45, vite 8.3.8, happy-dom 21.0.4 and transitive
  patches. That resolved 12 alerts.
  - happy-dom 20→21 is a major. Its only breaking change turns off CSS and iframe loading by default, and no test
    uses either.
  - Prod webapp confirmed on the ghcr image tagged `2be2fe7` by digest. Container-local `index.html` and the entry
    bundle return 200.
  - Open alerts measured after the merge: **16 → 4**.
- **vitest and `@vitest/coverage-v8` ^4.1.4 → ^4.1.12** (same major) in this PR. That clears the remaining
  vitest/`@vitest/mocker` advisories.
  - npm 10, which CI uses, crashes on this install (`edgesOut`). The lockfile was written with npm 11 and normalised
    with npm 10, and npm 10's `npm ci` then passed. `webapp/docs/development.md` records the recipe.
- **minimatch alert dismissed as tolerable risk**, on John's call.
  - The fix is minimatch 11, and even the latest eslint and typescript-eslint pin `^10`.
  - The risk is a DoS through glob patterns, and the only patterns come from the repo's own lint config.

### 2.3 Left as is

- `glob` 10.5.0 (GHSA-3g3m-2fjr-6pw4, which Dependabot auto-dismissed) comes in through `@vue/test-utils` →
  js-beautify. It is dev-only, and its fix is 14.0.2, a major.
- Older Dependabot PRs stay open: #10 (minor-and-patch, overlaps #33) and #18 (`@vitest/coverage-v8` 5, a major
  that would mismatch vitest 4). Both now need a rebase or closing, and neither is needed for the alerts.

## 3. Revoked API keys reappeared on the API Keys page

- **Confirmed:** after John revoked two prod keys (12:11 CET), they reappeared on reload looking active.
  - `list_api_keys` returns revoked keys too.
  - The page ignored `revoked_at`, and on revoke it only dropped the row locally.
  - Read-only prod check: both keys had `revoked_at` set, and neither was used after it. The login check filters
    `revoked_at IS NULL`, so they were dead.
- **Fix (John chose "show as revoked"):** revoked rows stay listed, greyed out, with "Revoked <date>" instead of the
  Revoke button. After a revoke the page re-reads the list from the server.
- **Evidence:**
  - Red before the fix: the revoke test failed (no reload) and the new revoked-row test found no marker.
  - On the local stack, a key revoked via the API showed as "Revoked 12 Nov 2026, 13:08" after a reload.
- **Test hygiene:** `beforeEach` now calls `mockApiFetch.mockReset()`. `vi.clearAllMocks()` keeps queued
  `mockResolvedValueOnce` values, which leaked one failing test's responses into five others.

## 4. API Keys page layout

- **Asked:** the table tile was too narrow (896px), so Created, Last used and the revoked label wrapped.
- **Decided by mockup:** three options (https://claude.ai/artifact/1bHyaY5R7Y2ZLJxJ434FLN):
  - A: a Status column
  - B: revoked keys folded away
  - C: just wider

  John picked **B**.
- **Built:**
  - The tile is `max-w-6xl` (1152px), with no wrapping in name, date or action cells.
  - A one-line explanation of what keys are for sits under the heading.
  - The main table lists only working keys (not revoked, not past `expires_at`).
  - Revoked and expired keys sit in a closed `<details>` titled "Revoked and expired (N)", each with "Revoked <date>" or
    "Expired <date>". It shows only when it has keys.
- **Departures from the mockup:**
  - The folded table is not faded, so its grey text keeps full contrast.
  - Its last column is "Ended", because it holds both kinds.
- **Evidence:**
  - Four new tests, plus the two W3 tests updated for the folded section, were red before the change.
  - Local stack at 1500px, seeded with a key in each state: tile 1152px, no cell taller than one line, no sideways
    scroll, light and dark both checked by screenshot. John looked and said "lgtm".
- **Test hygiene:** the test file freezes the clock at 2026-11-12. A fixture key expiring 2026-12-31 would otherwise
  turn "expired" and redden the tests in January.
- **Not done:** no design system or brand work; the repo has none, and this stayed inside the existing Mosaic styles.

## 5. What is deliberately not done

- Expiry dates for keys already created in prod can't be recovered: the page dropped them before they reached the
  server. Whether to list or revoke those keys is John's call.
