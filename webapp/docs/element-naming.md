# 1. Element naming convention (`data-testid`)

This webapp identifies significant DOM elements with the **`data-testid`**
attribute. It is the single, canonical way to name an element — for tests,
for browser/devtools targeting, and for referring to a part of the UI
precisely in conversation ("the draft block" → `[data-testid="draft-block"]`).

We deliberately do **not** add `id` attributes for this purpose. `id` must be
unique per document, so repeated elements (chips, list rows, table rows) can't
carry a static one; `data-testid` has no such restriction and already covers the
whole app (600+ usages). One vocabulary, no second system to keep in sync.

## 1.1 Rules

- Use `data-testid="kebab-case-name"` (not the short `data-test=` — that legacy
  spelling was standardized away in the storylines files).
- Name **areas, panels, toolbars, and named action buttons** — the things you'd
  point at when describing the page. Don't blanket every element.
- For repeated elements, give the **container** a stable name and let the
  repeated item share one (e.g. `chapter-chip` on each chip); disambiguate by
  position or by interpolating an id into the attribute
  (`:data-testid="`anchor-editor-remove-${entity.id}`"`).
- The Vitest suite selects on `data-testid`, so renaming one means updating its
  selectors in the same change.

## 1.2 Storylines detail view (`/storylines/N`) — key names

Reference map for `StorylineDetailView.vue` after the 2026-06-15 layout change
(chapters moved from a left rail to a horizontal `flex-wrap` strip below the
anchors row, so the two-panel reader uses the full width):

| `data-testid`                  | Element                                             |
| ------------------------------ | --------------------------------------------------- |
| `storyline-detail-view`        | Page root                                           |
| `storyline-meta`               | Meta strip (anchors, last-generated, citation count)|
| `storyline-anchors`            | Anchors chip row                                    |
| `chapters-bar`                 | Chapters section (heading + add + strip)            |
| `chapter-strip`                | The wrapping row of chapter chips                   |
| `chapter-chip`                 | One chapter chip (wraps button + badge + edit menu) |
| `chapter-rail-item`            | A chapter's select button                           |
| `chapter-generating`           | Per-chapter "generating…" badge                     |
| `add-chapter`                  | "+ Add chapter" button                              |
| `storyline-reader`             | Two-panel reader container                          |
| `narrative-panel`              | Narrative panel                                     |
| `chapter-reader-<id>`          | One published chapter in the reader                 |
| `chapter-toc` / `toc-item-<id>` | Chapter table of contents                          |
| `draft-block` / `draft-refresh-button` | The in-progress draft chapter               |
| `delete-button`                | Header delete action                                |
