# Multi-entity storylines — webapp side

**Date:** 2026-05-12. **Branch:** `eng-multi-entity-storylines`.
**Companion:** `server/journal/260512-multi-entity-storylines.md`.
**Plan:** `.engineering-team/plan-multi-entity-storylines.md` (parent).

## What shipped

- `Storyline*` TypeScript types updated: `entity_id: number` replaced
  by `anchors: { id: number; canonical_name: string }[]` on
  `StorylineSummary`, `StorylineDetail`, and `CreateStorylineResponse`.
  New `StorylineAnchor`, `SetStorylineAnchorsRequest`,
  `SetStorylineAnchorsResponse`. `CreateStorylineRequest` now takes
  `entity_ids: number[]`.
- `setStorylineAnchors` API helper added to `src/api/storylines.ts`.
  Wraps `PUT /api/storylines/{id}/anchors`.
- `StorylineCreateModal` upgraded from single-select to multi-select:
  picked entities show as removable chips above the search box; the
  search results list toggles membership on click (✓ when picked).
  Auto-name reads as "X" / "X and Y" / "X, Y, and Z" until the user
  overrides it. Soft cap of 15 enforced client-side (input disables
  with a cap-reached message). Server still validates.
- List + detail views display anchors as a row of clickable
  violet-pill chips linking to each entity. The old single-entity
  link is gone.
- List view sort column changed from "Entity" to "Anchors" — sorts
  by the first anchor's canonical name (deterministic since the
  server returns anchors sorted by id ASC).

## What I deliberately deferred

Anchor _editing_ UX on an existing storyline. The REST + MCP
surfaces have `set_anchors` today; the webapp doesn't wire it up
yet. This is the next follow-up plan: it's a UX problem of its own
scope (multi-select with diff against current set? drag-to-reorder
if order ever becomes user-facing? confirm-before-stale-panels?).
See the plan doc's "Open items / follow-ups" section.

## Component decisions

- **Toggle, not append-only.** Clicking a search result either adds
  or removes the entity from the picked set. Mirrors the entity-merge
  picker pattern in `EntityListView.vue` rather than inventing a new
  one.
- **Picked chips above search, not inline checkboxes.** Picked anchors
  stay visible even when the search query changes, so the user can
  see what they've already chosen while searching for the next one.
- **Auto-name with English joins.** Names read naturally: "Atlas",
  "Atlas and Vienna", "Atlas, Sara, and Vienna". User-override
  preserved via `nameDirty` flag, same pattern as the single-select
  version.
- **Server `MAX_ANCHORS = 15` duplicated client-side as a constant.**
  Keeping it in sync is a coupling we accept; server is the source
  of truth and rejects above-cap requests with 422, but the client
  cap saves a roundtrip and gives a more informative inline message.

## Test counts

- 1647 passed (was 1646). One net test added: the new
  "clicking the same result twice toggles it off" multi-select case.
- The old "change button clears picker" test was rewritten as
  "clicking × on a chip drops the anchor."
- Coverage: 91.97 / 85.4 / 90.6 / 94.12 — all above the 85%
  threshold.

## Manual verification — done

Confirmed in the browser on 2026-05-12: multi-entity storylines work
end-to-end. Creating a 2-anchor storyline via the modal renders both
anchor chips on the list and detail views; the narrator panel mentions
both entities by name; the regenerated corpus picks up entries that
mention either anchor.
