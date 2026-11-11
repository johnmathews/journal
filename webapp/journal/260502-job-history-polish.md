# Job History UI polish

The Job History page had three rough edges:

1. The Params column was a single comma-joined string clipped at 200px — long
   date ranges like `force, 2026-02-02 to 2026-02-…` truncated with no way
   to see the rest.
2. Reprocess-embeddings (and mood-score-entry) jobs rendered a "+" expand
   affordance that, when clicked, showed exactly the same content as the
   collapsed summary. The button was a UX lie.
3. Long failure messages had no overflow story at all and the only way to
   read them was to widen the column.

## Changes

### `JobParamsCell` — chips instead of joined strings

New component renders each param as its own pill:

- Date range: `2026-02-02 → 2026-02-28`
- Mode: amber for `force`, neutral for `stale-only`
- `stale_only` boolean flag
- `source_type`, `entry_date` for ingestion
- `notify_strategy` for `save_entry_pipeline`

Internal-only keys (`entry_id`, `user_id`, `parent_job_id`) never appear as
chips. `entry_id` is already shown in the Entry column; the others are
plumbing.

The cell drops the `max-w-[200px] truncate` that was causing the original
problem — chips wrap cleanly inside the cell.

### `JsonPopover` — click-to-open raw view

Reusable popover used in two places:

1. Every Params cell gets a `raw` trigger that shows the full
   `params` object as JSON. Useful for debugging when an internal key
   matters (which user submitted this? which parent job?).
2. Failed jobs with error messages > 80 chars get a red `full` trigger
   that reveals the entire stack trace / error string.

The panel teleports to `<body>` so it isn't clipped by the table's
`overflow-x-auto` wrapper, and positions with `position: fixed` based on
the trigger's bounding rect. Closes on outside click and Escape.

### `isExpandable(job)` — honest expand affordance

The Details column's "+" and click handler now only render when expansion
actually reveals new content:

- `follow_up_jobs` has entries → expandable (badges only show when expanded)
- non-empty arrays exist → expandable (collapsed summary skips arrays)
- ingestion jobs: visible scalars beyond `word_count`/`chunk_count`/
  `page_count`/`recording_count` → expandable
- otherwise: ≥ 2 visible scalars → expandable

For `reprocess_embeddings` results that are just `{chunk_count: N}` and
`mood_score_entry` results that are just `{scores_written: N}`, the row
now renders as static text — no "+" icon, no `cursor-pointer`.

### `save_entry_pipeline` job type

The backend has had this for a while but the frontend's `JobType` union
didn't include it, so it rendered as the raw `save_entry_pipeline`
string. Added it to the union, gave it the label `Entry pipeline`, and
an indigo badge to distinguish it from the related `Reprocess embeddings`.

## Tests

- `JsonPopover.spec.ts` — 8 tests covering open/close/Escape/outside-click,
  string vs object content, and the optional title heading.
- `JobParamsCell.spec.ts` — 9 tests covering each chip type, mode-color
  variants, and the internal-keys-still-expose-raw behavior.
- `JobHistoryView.test.ts` — extended with cases for non-expandable
  reprocess/mood-score rows, expandable entity-extraction and follow-up
  rows, and the long-error vs short-error popover trigger.

Full webapp suite: 1218/1218 passing. Coverage: 91% statements / 85%
branches / 88% functions / 93% lines — all above the 85% pre-push gate.

## Verified visually

Loaded the page in Playwright with seeded jobs covering each type, both
in light and dark mode. Confirmed:

- Chips render correctly with no truncation
- Reprocess-embeddings and mood-scoring rows have no "+"
- `raw` popover opens with formatted JSON, closes on outside click
- `full` error popover renders above the table (teleport + fixed
  positioning fixed an initial clipping bug)
- Entity extraction's many fields still expand cleanly
- `save_entry_pipeline` shows as "Entry pipeline" with the indigo badge
