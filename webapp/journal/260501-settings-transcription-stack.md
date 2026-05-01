# 2026-05-01 — Settings: full transcription stack display

The webapp's `SettingsView` now surfaces the complete multi-provider
transcription stack (provider, fallback, shadow), matching the expanded
`GET /api/settings` payload.

## Why

Server-side work for multi-provider transcription landed in
`journal-server` (branch `eng-multi-provider-transcription`,
[PR #7](https://github.com/johnmathews/journal-server/pull/7)). The
`/api/settings` response's `transcription` block grew from a single
`{ model }` field to a structured object with `provider`, `fallback`,
`shadow`, and `retry` sub-objects. The flat `transcription.model`
field is preserved for backwards compatibility — cost calculations
still use it unchanged.

The webapp needed to (a) accept the new shape in TypeScript without
breaking the build and (b) display the new fields read-only so the
operator can confirm at a glance which provider is primary, what the
fallback is, and whether shadow logging is on.

## What changed

- **`src/types/settings.ts`** — extended `ServerSettings.transcription`
  to include `provider`, `fallback { enabled, model }`,
  `shadow { enabled, provider, model }`, and
  `retry { max_attempts, base_delay_seconds, max_delay_seconds }`. The
  flat `model` field stays.
- **`src/views/SettingsView.vue`** — under the existing `1b. Audio
  Ingestion` section, three new `<dl>` rows after `Transcription
  Model`:
  - **Provider:** plain string (e.g. `openai`).
  - **Fallback:** `enabled — {model} (after {n} retries)` when on,
    `disabled` when off.
  - **Shadow:** `{provider} / {model} (logging diffs only)` when on,
    `off` when off.
- **`src/views/__tests__/SettingsView.test.ts`** — five new tests
  covering provider display, fallback enabled/disabled, and shadow
  on/off. Existing `makeSettings()` fixture updated with the new
  fields.
- **`src/stores/__tests__/settings.test.ts`** — fixture updated to
  match the new `ServerSettings` shape.
- **Journal entry** — this file.

## What did not change

- `src/api/settings.ts` — typed pass-through, picks up the type change
  automatically.
- `src/utils/cost-estimates.ts` — still consumes
  `transcription.model` (the flat field), no edits needed.
- The existing `Paragraph Formatting` toggle and conditional
  `Formatting Model` row — left in place beside the new rows in the
  same `<dl>`.
- Display only — provider, fallback, and shadow are env-var-driven on
  the server and require a restart to change. No editing UI.

## Tests

`npm run test:unit` — all suites pass. `npm run test:coverage` keeps
statements/branches/functions/lines above the 85% pre-push threshold;
the change is small and the new tests exercise both branches of the
`v-if` blocks (fallback on/off, shadow on/off), so coverage holds.

## Cross-reference

- Server PR: <https://github.com/johnmathews/journal-server/pull/7>
- Server branch: `eng-multi-provider-transcription`
- Webapp branch: `eng-settings-transcription-stack`
