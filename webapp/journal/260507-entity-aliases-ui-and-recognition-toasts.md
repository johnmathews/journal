# Entity aliases UI, collision merge, manual merge, re-embed toasts

**Date:** 2026-05-07
**Branch:** `worktree-eng-entity-aliases-ui`
**Plan:** parent workspace `journal/.engineering-team/plan-entity-aliases-and-recognition.md`.
Server slices A and B already shipped 2026-05-06 / 2026-05-07.

## Context

Slice A (server) gave us alias CRUD endpoints + an async re-embed-on-edit
job. Slice B (server) gave us stage-0 LLM-asserted matching with the
four-guard sanity check. This is Slice C — the webapp side that closes
the user-facing loop.

## What changed

### WU5 — Alias edit UI on `EntityDetailView`

The aliases section is now interactive: each alias is a chip with an
inline remove button, and a small form below adds a new alias. The
form sits inside the existing left-column entity card. Empty state
("No aliases yet.") shows when the entity has none.

- **API client:** `addEntityAlias`, `removeEntityAlias`,
  `lookupAliasOwner` in `src/api/entities.ts`.
- **Types:** `AliasCollisionResponse`, `AliasLookupResponse` in
  `src/types/entity.ts`.
- **Store:** `addAlias`, `removeAlias` actions on
  `useEntitiesStore`. Both update both `currentEntity` and the
  cached entry in `entities[]` so list views stay in sync without a
  refetch.

### WU6 — Re-embed job toast pipeline

`updateEntity` API response is now typed as `Entity & {
reembed_job_id?: string }` because the server appends a
`reembed_job_id` field whenever the patch changed `description`. The
store's `updateCurrentEntity` action picks that up and registers the
job with the existing `useJobsStore.trackJob` machinery so
`AppNotifications` polls and shows a toast on success/failure
automatically. The transport-only `reembed_job_id` is stripped before
storing in `currentEntity` so the view types stay clean.

`JobType` union extended with `'entity_reembed'`. The
`AppNotifications.jobLabel` switch labels it "Entity recognition
refresh".

### WU7 — Alias collision merge dialog

New `src/components/entities/AliasCollisionDialog.vue`. When
`addAlias` rejects with `ApiRequestError(status=409, body=...)`,
`EntityDetailView` opens this dialog with the existing entity's
id/name/type. On confirm, the dialog calls
`POST /api/entities/merge` with `survivor_id =
existing_entity_id, absorbed_ids = [currentEntityId]` (the existing
entity wins because its alias was already attached) and routes to
the survivor's detail view.

To preserve the structured 409 body all the way to the dialog,
`ApiRequestError` gained a `body: Record<string, unknown> | null`
field populated from the JSON response. Existing callers ignore it.

### WU8 — Manual merge from `EntityDetailView`

New `src/components/entities/EntityMergeIntoDialog.vue` plus a
"Merge into…" button on the detail view's action row. The dialog has
a debounced search input that calls `fetchEntities({search, type})` —
restricted to the same `entity_type` because the server's uniqueness
key is `(canonical_name, entity_type)` and cross-type merges have
never been supported. Selected target wins; current entity is
absorbed; user lands on the survivor.

`EntityListView`'s existing multi-select merge flow is unchanged —
the new dialog is a parallel path keyed off the detail view, not a
refactor of the list one. They have different UX shapes (two-entity
explicit merge vs N-entity multi-select with survivor radio) so
sharing a component would have meant juggling props that contradict
each other.

## Test summary

Baseline: 1326 tests passing. Coverage 85.04% statements / 84.96%
branches → branches gate (85%) was already razor-thin.

After Slice C:
- **+13 new tests** for `EntityMergeIntoDialog` and
  `AliasCollisionDialog` component-spec files.
- **+8 new tests** for the alias-edit flow on `EntityDetailView`
  (empty state, add, validation, remove, error, collision dialog
  open, merge-into dialog open, ...).
- **+5 new tests** for `addAlias`, `removeAlias`, and `reembed_job_id`
  trackJob plumbing on the entities store.
- **1 line of test mock additions** to keep the existing mocks of
  `@/api/entities` aware of the new exports.

Final: tests pass; coverage **91.22% / 85.11% / 88.34% / 93.37%** —
all four metrics above the 85% gate.

## Decisions worth flagging

1. **Collision direction.** When user A tries to add alias "Mum" to
   entity X and "Mum" is already on entity Y, we offer to merge X
   into Y (Y is the survivor). That preserves the alias mapping the
   user just tried to assert and removes the duplicate. The
   alternative (merge Y into X) would yank the alias off Y, which
   would be surprising.
2. **Routing on merge.** Both the collision dialog and the manual
   merge dialog route the user to the survivor on success. The view
   is keyed by the route param and re-runs `loadEntity` via a
   `watch`, so the absorbed entity gets cleared automatically.
3. **`reembed_job_id` is transport-only.** It's added to the
   `UpdateEntityResponse` type and stripped in the store before
   landing in `currentEntity`. Keeps `Entity` clean for everything
   else that consumes it.
4. **Cross-type merges deliberately blocked.** The merge-into search
   filters by the current entity's type. The server would silently
   refuse a cross-type merge anyway (uniqueness on
   canonical_name+entity_type) so showing them as candidates would
   just create an error UX.
5. **Webapp-only slice — server endpoints all already shipped.** No
   API contract changes. The only "new" dependency is that this
   webapp now requires a server with Slice A + B running; older
   server versions won't have the alias endpoints or the
   `reembed_job_id` field.

## Wrap-up follow-ups

During `/done` after the slice landed, two small follow-ups went in:

1. **`docs/architecture.md`** — note alias-management actions on the
   entities store (`addAlias`, `removeAlias`), the `reembed_job_id`
   tracking pipeline in `updateCurrentEntity`, the new
   `ApiRequestError.body` field, and the new `entities.ts` API
   functions.
2. **`docker-compose.yml`** — swap `chromadb/chroma:latest` for
   `ghcr.io/johnmathews/journal-chromadb:latest` (the journal-server
   side of the project ships a chromadb image with `curl` baked in).
   The healthcheck command uses `curl`, and the upstream chromadb
   image doesn't include it, so the healthcheck would fail forever
   and `journal-server`'s `depends_on: service_healthy` would
   deadlock. Pre-existing issue, caught here by the /done healthcheck
   validation step.
