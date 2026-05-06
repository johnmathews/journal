# 2026-05-06 — Mood-trends default + quarantine UI surface

Engineering-team session, webapp side of a cross-cutting change. Sibling commit lives in
`journal-server` (`260506-entity-casing-quarantine-and-merge-candidates.md` — same date,
same session).

## Context

User asked for three things: mood-trends affect-axes default on page load; smart-cased
entity names; auto-removal of stale entities. The webapp side is (1) the dashboard
default and (2) UI surface for the new soft-quarantine system that the server uses to
hide hallucinated/zombie-rebound entities. The server-side investigation showed the
"stale entity" wasn't actually orphaned — it was an LLM hallucination that survived
re-extraction. The full backend story is in the sibling journal entry.

## What shipped

### WU1 — Mood-trends default = affect-axes group

- `src/stores/dashboard.ts` — removed `DEFAULT_ISOLATED_MOOD = 'agency'`. The
  `loadMoodDimensions()` first-load defaults now resolve via `MOOD_GROUPS.find(g => g.id
  === 'affect')`, intersected with the dimensions returned by the server. Falls back to
  empty (=show-all) if the affect group is missing.
- No persistence — selection isn't stored in localStorage, so the new default takes
  effect on next reload for everyone.
- Tests updated in `src/stores/__tests__/dashboard.test.ts` and
  `src/views/__tests__/DashboardView.test.ts`. Three new tests for empty-dimensions /
  affect-group-missing / partial-availability.

### WU7 — Quarantine UI surface

- `src/types/entity.ts` — extended `Entity` and `EntitySummary` with
  `is_quarantined` / `quarantine_reason` / `quarantined_at`.
- `src/api/entities.ts` — added `fetchQuarantinedEntities`, `quarantineEntity`,
  `releaseQuarantine` clients.
- `src/stores/entities.ts` — added `quarantinedEntities`, `quarantinedLoading`,
  `loadQuarantined`, `releaseEntityQuarantine`. Eager-loaded on mount so the badge count
  shows immediately.
- `src/views/EntityListView.vue` — new Active / Quarantined tabs with a count badge
  (only renders when count > 0). Quarantined mode shows reason + relative timestamp +
  per-row Release button. Type filter and pagination hidden in quarantined mode.
  Multi-select checkboxes from the existing merge flow continue to apply.
- `src/views/EntityDetailView.vue` — yellow warning banner at the top when
  `is_quarantined`, with "Release from quarantine" button that calls the API and
  updates the local view.
- 21 new tests (3 API client + 6 store + 8 list view + 4 detail view).

## Test results

- `npm run test:unit`: **1319 passing** (was 1298 pre-session), 0 failures, 74 files.
- `npm run lint`: clean.
- `npm run test:coverage`: statements 91.41% / branches 85.34% / functions 88.53% /
  lines 93.49%. All ≥ 85% threshold.
- Type-check (`vue-tsc --noEmit`): clean.

## Visual verification

Skipped — local stack not running at the time of implementation. Unit and component
tests cover the regressions; the `MOOD_GROUPS` source of truth for the affect group is
well-covered already. Recommend a manual smoke once the stack is up: navigate to
dashboard, confirm affect-axes-only on first load; quarantine an entity via curl, switch
to Quarantined tab, click Release.

## Sibling commit

Backend: `journal-server` commit (same date) ships server-side endpoints, schema
migration, the post-extraction sanity sweep, smart-title-casing, the relaxed
merge-candidate detector, and the corresponding documentation.

## Follow-up — `ac00213` (empty-state copy)

After deploy the Quarantined tab was empty in prod (good — nothing currently
quarantined). User asked for richer empty-state copy explaining what would land here
and what to do with it. Two-paragraph version: when extraction runs, entities whose
canonical name no longer appears in any mention quote or entry text get quarantined
here for review before deleting permanently — or merging into a clean entity if the
underlying meaning is still valid.

## Follow-up — `0a07566` (Hard-Delete button)

Paired with the server-side `entity_merge_history` audit-trail fix. User wanted a
direct way to permanently delete a quarantined entity from the Quarantined tab — the
existing Delete button on the detail view required navigating in and back out.

Per-row red Delete button next to the amber Release button. `window.confirm`
prompt is explicit about irreversibility and recommends Merge instead if the
underlying data is salvageable. Reuses the existing
`DELETE /api/entities/:id` endpoint (cascades unchanged). Store's `removeEntity`
now also prunes from `quarantinedEntities` so the row disappears immediately
instead of waiting for a reload.

Tests: 1322 passing (+3 over the main commit baseline of 1319).
