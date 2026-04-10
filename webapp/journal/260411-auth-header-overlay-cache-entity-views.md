# 2026-04-11 — Auth header, overlay cache fix, entity tracking Phase 1

Cross-cutting session on the `eng-session-2026-04-10` branch paired
with the same-named branch on `journal-server`. Three changes:

## 1. Bearer token auth (pairs with journal-server security work)

The server now refuses to start without `JOURNAL_API_TOKEN` and
rejects every request to `/api/*` and `/mcp` without an
`Authorization: Bearer <token>` header. The webapp had to move in
lockstep.

- `src/api/client.ts` — `apiFetch` now reads the token from
  `import.meta.env.VITE_JOURNAL_API_TOKEN` **per call** (not at
  module load time) so `vi.stubEnv` can change the value at runtime
  without dynamic imports. In production the value is inlined by
  Vite at build time, so the per-call read is effectively free.
  Caller-supplied headers override the default `Authorization`, which
  leaves a door open for future "override auth for one request"
  cases.
- `env.d.ts` — typed `VITE_JOURNAL_API_TOKEN` as a readonly string.
- `.env.example` — new file at the repo root documenting
  `VITE_API_URL` and `VITE_JOURNAL_API_TOKEN`, with the
  `openssl rand -hex 32` / `secrets.token_urlsafe(32)` hint.
- `src/api/__tests__/client.test.ts` — tests for token-present,
  token-absent (no header at all), and caller-override cases.

## 2. Overlay cache invalidation on save (next-session item 5)

When the user saves an edited entry, the server re-chunks and
re-embeds, which means the webapp's cached `chunks` and `tokens` for
that entry describe the OLD `final_text` and their offsets no longer
line up with the re-chunked server state. Previous behaviour: the
cache survived the save, so switching overlay off→on after an edit
showed stale boundaries.

- `src/views/EntryDetailView.vue` — in the `save()` success path,
  null out `chunks.value`, `tokens.value`, and `overlayError.value`.
  Deliberately leave `overlayMode` alone so the user's choice is
  preserved; the next off→on flip will refetch.
- `src/views/__tests__/EntryDetailView.test.ts` — two new regression
  tests (`refetches chunks after save ...`, `refetches tokens after
  save ...`) that exercise the full flow: warm the cache, dirty the
  textarea, save, flip overlay, confirm a fresh fetch fires.

## 3. Entity tracking — Phase 1 frontend

Read-only browsing of the entities the server extracts. Shipping
this alongside the backend so the feature is usable end-to-end as
soon as a batch extraction run populates the database.

- `src/types/entity.ts` — `Entity`, `EntitySummary`, `EntityMention`,
  `EntityRelationship`, `EntryEntityRef`, and all the
  list/response/params types. Mirrors the server's REST shapes in
  `journal-server/src/journal/api.py`.
- `src/api/entities.ts` — `fetchEntities`, `fetchEntity`,
  `fetchEntityMentions`, `fetchEntityRelationships`,
  `fetchEntryEntities`, `triggerEntityExtraction`. Reuses the same
  `buildQuery` helper pattern as `entries.ts` — deliberately
  duplicated rather than shared because the two shapes will drift.
- `src/stores/entities.ts` — Pinia setup-style store matching
  `entries.ts` exactly (`ref` state, `computed` getters, async
  actions). `loadEntity` fires three parallel fetches (entity,
  mentions, relationships) via `Promise.all`. `clearCurrent` resets
  detail-view state.
- `src/views/EntityListView.vue` — searchable, type-filtered table
  with pagination. Type filter renders as a pill group
  (All / Person / Place / Activity / Organization / Topic / Other)
  with distinct Tailwind hues per type. Search debounces at 250 ms.
  Empty / loading / error states follow the `EntryListView` triptych
  pattern.
- `src/views/EntityDetailView.vue` — header with type badge +
  aliases + description, two-column layout below: outgoing and
  incoming relationships on the left, mention timeline on the right.
  Mentions link to the source entry; relationships link to the other
  entity. Confidence displayed as a percentage next to each mention.
- `src/views/EntryDetailView.vue` — new chip strip after the header
  meta row, lazy-fetched via `fetchEntryEntities(id)` on mount.
  Failures are silently swallowed — the strip just stays hidden if
  the entry hasn't been extracted yet. Each chip is a `RouterLink`
  to the entity detail view, styled with the same per-type palette.
- `src/components/layout/AppSidebar.vue` — new "Entities" nav item
  alongside "Entries" with its own icon and active-state highlight.
- `src/router/index.ts` — two new routes: `/entities` and
  `/entities/:id`.

## Tests

- Baseline before session: 157 passing across 15 files
- After session: **184 passing across 19 files** (27 new tests)

New test files:
- `src/api/__tests__/entities.test.ts` — 7 tests for every client
  function
- `src/stores/__tests__/entities.test.ts` — 5 tests for store
  state, error handling, parameter merging, parallel fetch,
  `clearCurrent`
- `src/views/__tests__/EntityListView.test.ts` — 5 tests: mount,
  row rendering, type filter, clear filter, empty state
- `src/views/__tests__/EntityDetailView.test.ts` — 5 tests: mount,
  header rendering, mentions, relationships, back navigation

Plus extensions to `EntryDetailView.test.ts` for the item 5 fix
(2 new tests) and the new `fetchEntryEntities` mock so the existing
tests don't hit the network. `client.test.ts` extended with
per-call env stubbing.

`npm run lint` clean. `npm run build` clean (type-check via
`vue-tsc --noEmit` passes, production bundle builds).

## Deferred to Phase 2

- **Graph visualization view** (`/graph`) using Cytoscape.js.
  Deferred until there's enough extracted data to visualise — an
  empty graph is not interesting to look at.
- **Entity extraction trigger UI.** You can call
  `triggerEntityExtraction()` from the API client but there's no
  button yet. The intended surface is the `EntryDetailView` — a
  "Extract entities" action next to the Save/Delete buttons — but
  deferred to Phase 2 so the initial population happens via the CLI
  (`journal extract-entities`) rather than the webapp.
- **Entity merge review UI.** The backend emits warnings for
  potential merges (embedding-similarity matches above threshold)
  but there's no surface in the webapp to review them. Future work.

## Risks and known gaps

- **No entity chips cache invalidation on save.** If the user saves
  an edited entry, the chip strip doesn't refetch — it continues
  showing entities extracted from the pre-edit text until a full
  page reload. Not a bug exactly: chips show *historical* extraction
  state, and the user needs to explicitly re-run extraction anyway
  before the entity graph is updated. Worth revisiting if the
  workflow becomes "edit, save, re-extract from within the webapp".
- **Sidebar route matching.** I used `isActive` (not `isExactActive`)
  on the Entities link so it stays highlighted on `/entities/:id`
  detail views. This is correct behaviour but differs from the
  existing Entries link which uses `isExactActive` and deactivates
  on `/entries/:id`. Keeping the existing Entries behaviour alone
  so the sidebar change is additive-only.
- **Pagination state doesn't survive navigation.** If the user
  clicks an entity, views its details, then navigates back to
  `/entities`, they land on page 1 not the page they came from.
  Minor UX issue — fix is to persist `currentParams.offset` across
  mount cycles.

## Context for the next session

Once the user runs `journal extract-entities` on the server against
a few real entries, come back and verify the list/detail views
render correctly with real data. Visual polish pass is expected.

Graph visualization should wait until there are at least 30-50
entities and a handful of relationships — anything smaller is a
toy, not a useful knowledge graph.
