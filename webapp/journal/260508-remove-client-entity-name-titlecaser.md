# Remove client-side entity name title-caser

**Date:** 2026-05-08

## What I noticed

Two views disagreed about the same entity:

- Dashboard "What I Write About": `running` lowercase, 16 mentions.
- Entities admin: `Running (Night Run, Run, Runs)`, 16 mentions.

Same row, same column, two different rendered strings.

## Root cause

`src/utils/entityName.ts` (`displayName()` and `displayAliases()`) was a
render-time title-caser that EntityListView, EntityDetailView, EntryDetailView,
EntityMergeIntoDialog, and AliasCollisionDialog all called. The dashboard
chart did not. So the admin view was *cosmetically lying* about what the DB
actually stored — most entities have been raw LLM lowercase output ever since
ingest, and `displayName()` was masking that.

The server gained its own `smart_title_case` write-time normaliser two days
ago. We were running two normalisers in different layers that had drifted —
`displayName()` strips hyphens (`pull-ups → Pull Ups`) where the server
preserves them (`Pull-Ups`); `displayName()` knows `SQL`/`API` while the
server's exceptions TOML didn't; etc.

## What changed in this repo

1. Deleted `src/utils/entityName.ts` and `src/utils/__tests__/entityName.test.ts`.
2. Replaced every `displayName(x)` call with raw `x` and every
   `displayAliases(arr)` with `arr.join(', ')` across:
   - `views/EntityListView.vue`
   - `views/EntityDetailView.vue`
   - `views/EntryDetailView.vue`
   - `components/entities/EntityMergeIntoDialog.vue`
   - `components/entities/AliasCollisionDialog.vue`
3. Added a regression test in `views/__tests__/EntityListView.test.ts` that
   feeds a lowercase `canonical_name` and an alias from the API mock, asserts
   the rendered text contains them verbatim and does NOT contain a
   title-cased version. This guards the contract.
4. Updated `docs/architecture.md`: removed the `entityName.ts` bullet,
   added a "Display contract: the DB is the single source of truth" section.

## Server-side companion change

In `journal-server` (sibling repo), commit on the same day:

- New `journal renormalise-entity-casing` CLI to re-apply the server
  normaliser to existing rows.
- Server `smart_title_case` algorithm refined to per-word checks (handles
  `iOS app → iOS App` correctly).
- Extraction prompt now explicitly requests Title Case.
- `update_entity` runs `smart_title_case` so admin edits can't reintroduce
  drift.
- Exceptions TOML extended with the union of the old client `ACRONYMS` /
  `SPECIAL_WORDS` rules.

## After both PRs land, do this

Run `uv run journal renormalise-entity-casing --apply` in any environment
with existing data. Otherwise, the dashboard chart and the entities admin
will start agreeing — but on the *raw* DB values, which are still
pre-normalisation.

## Verification

- `npm run test:unit`: 1323 passing (75 files). Net change: -33 from removed
  `entityName.test.ts`, +1 new regression test, no regressions elsewhere.
- `npm run lint`: clean (autofix removed a dangling `</strong>` in
  `AliasCollisionDialog.vue` after I deleted a `displayName(...)` wrapper).
- `npm run build`: passes type-check + production build.
