# Saved-credentials UX in GarminConnectionCard (W7 of the garmin-credentials plan)

**Date:** 2026-07-14

## 1. Context

The server now stores an encrypted copy of the user's Garmin password when
`FITNESS_CREDENTIAL_KEY` is set (journal-server W4–W6: Fernet ciphertext in
`fitness_auth_state.extra_state_json`, unattended re-login on a dead token
blob, and a `POST /api/fitness/garmin/reconnect` endpoint). This session gave
that feature its webapp surface — and fixed copy that the server change had
made inaccurate. Server counterpart journal entry:
journal-server `journal/260714-garmin-credential-persistence.md`.

## 2. Surfacing credentials_saved

The garmin payload of `GET /api/fitness/sync/status` now carries
`credentials_saved?: boolean` (`types/fitness.ts`; optional so payloads from
older servers parse fine and read as false). `GarminConnectionCard` computes
`credentialsSaved` from `=== true` and drives three things off it: an
informational "Credentials saved — re-authentication is usually automatic"
line on the resting card, the accurate password-storage copy (§5), and the
one-click reconnect affordance (§3). The server already reports `false` for
saved-but-undecryptable ciphertext (rotated key), so the card never offers a
reconnect that is doomed to 409.

## 3. One-click reconnect

When auth is broken **and** credentials are saved, the primary action is a
"Reconnect with saved credentials" button (`data-testid=
"garmin-reconnect-saved-btn"`) calling the new `reconnectGarmin()` wrapper
(`src/api/fitness.ts`, `POST /api/fitness/garmin/reconnect`, no body). A
dedicated `reconnecting` UI mode keeps it distinct from the credentials-form
`submitting` state. Outcomes:

1. **Success** — reload sync status, back to the resting card. No password
   was ever typed.
2. **`mfa_required`** — drop straight into the *existing* MFA form with the
   returned pending session: the user types only the 6-digit code. Same
   pending-session mechanics as connect, zero new MFA code paths.
3. **`no_saved_credentials` (404) / `credentials_unavailable` (409)** — fall
   back to the credentials form with the reason-specific explanation kept
   visible (`openCredentialsForm()` normally clears errors; the handler
   re-sets the message after), so a rotated server key isn't a dead end.
4. **Rate limits / transient failures** — stay on the resting card with the
   error shown, so the user can simply retry the one-click path later.

## 4. Escape hatch

A small "Use different credentials" link renders next to the reconnect button
(broken + saved state only). It opens the plain credentials form — the path
for a user who changed their Garmin password, where the saved ciphertext is
valid Fernet but a wrong password upstream. Without it, the one-click button
would be the only visible action and a changed password would loop through
`invalid_credentials` with no obvious way out.

## 5. Copy correction

The password form claimed the password is "never stored on this server" —
unconditionally. That was true pre-W5 and wrong after. The note
(`data-testid="garmin-password-storage-note"`) now reads: the password is
sent to Garmin to mint a session token, and *if this server has credential
storage enabled*, it is also saved encrypted so future re-authentication can
happen automatically. Accurate in both storage modes without the client
having to know whether the server's key is set.

## 6. Tests

`GarminConnectionCard.spec.ts` gains cases for: the saved-credentials line
and copy in both `credentials_saved` states, reconnect-button rendering only
when broken + saved, success → status refresh, `mfa_required` → MFA form
(code-only), 404/409 → credentials-form fallback with explanation, and the
escape-hatch link. `api/__tests__/fitness.test.ts` covers the
`reconnectGarmin` wrapper; store fixtures gain `credentials_saved`. Coverage
stays above the global 85% thresholds.
