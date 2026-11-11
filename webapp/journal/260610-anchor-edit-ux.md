# 2026-06-10 — Storyline anchor-edit UX (W30)

Closed the named roadmap gap for storylines: anchors on an existing
storyline are now editable from the detail view. The server side
(`PUT /api/storylines/{id}/anchors`, the `journal_set_storyline_anchors`
MCP tool, and the webapp API client `setStorylineAnchors`) all existed;
this unit added the missing store action and UI.

## What shipped

- `stores/storylines.ts` — new `setAnchors(id, entityIds)` action with
  `savingAnchors` / `anchorsError` state. On success it refreshes
  `currentStoryline.anchors` and any matching list row from the server
  response (which is authoritative: the endpoint dedupes and sorts the
  ids ascending).
- `components/StorylineAnchorEditor.vue` — inline editor panel: picked
  chips seeded from the saved anchors, debounced entity search with
  toggle-on-click results (pattern reused from `StorylineCreateModal`),
  an added/removed diff summary, and a stale-panels confirm step.
- `views/StorylineDetailView.vue` — "Edit anchors" toggle next to the
  anchor chips; on save it closes the editor and, for "Save &
  regenerate", chains the existing regenerate flow (job tracking +
  auto-refresh on terminal state).
- `types/storyline.ts` — `MAX_ANCHORS = 15` is now exported from here
  and shared by the create modal and the editor (was duplicated).
- Docs: `docs/storylines.md` gained an "Anchor editing" section; the
  open follow-up was retired.

## Design decisions (the three open questions)

1. **Inline panel, not a modal.** Editing anchors is contextual to the
   detail view — keeping the current panels visible while editing lets
   the user see what a regeneration would replace. Modal reserved for
   creation, where there's no surrounding context to preserve.
2. **Diff-vs-current display.** The chips row shows the *proposed* set;
   a diff summary ("Adding" green / "Removing" red chips) appears as
   soon as the selection diverges. Save is disabled until the diff is
   non-empty and at least one anchor remains. Both views matter: the
   set is what gets saved, the delta is what needs sanity-checking.
3. **Confirm-before-stale-panels; no auto-kick.** Verified in the
   server code (`api/ingestion.py::set_storyline_anchors`) that the PUT
   only replaces anchor rows — it does not touch panels or queue a
   regeneration job. So the confirm step warns that panels go stale and
   offers "Save & regenerate" (client chains the existing regenerate
   action — exactly one job) or "Save only". No auto-kick on save:
   regeneration costs LLM tokens, and batching several anchor edits
   before one regeneration is a legitimate workflow.

## Tests

TDD: store spec (7 new cases — success, in-flight flag, current/list
state refresh, isolation, Error and non-Error failures), API client
spec (PUT shape), a 14-case component spec for the editor (pre-select,
diff branches, confirm branches, min-1/cap guards, search errors), and
5 view-level integration cases (open → modify → diff → save-only vs
save-and-regenerate, failure keeps the editor open). All written first
and confirmed red before implementation.
