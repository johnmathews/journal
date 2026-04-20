# Fix mood chart default dimensions + add pre-push hook

**Date:** 2026-04-20

## Mood chart bug

Only "agency" was visible when the dashboard loaded, despite the intent being to show three
dimensions: joy, agency, and proactive. Root cause: `DEFAULT_VISIBLE_MOODS` in the dashboard
store used short names (`joy`, `proactive`) that didn't match the server's actual dimension
names (`joy_sadness`, `proactive_reactive`). Only `agency` matched exactly.

Fixed by updating the set to `['joy_sadness', 'agency', 'proactive_reactive']` and updating
the corresponding test to use realistic dimension names from `mood-dimensions.toml`.

## Pre-push git hook

Added a `.git/hooks/pre-push` hook that runs `npm run lint` and `npm run test:unit` before
allowing a push. Not tracked by git — each developer sets it up locally. Documented the setup
in `docs/development.md`.
