# Job History view improvements

## What changed

Comprehensive overhaul of the Job History table at `/jobs`:

1. **Color-coded type badges** — each job type has a distinct color (blue for
   entity extraction, amber for mood, teal for image ingestion, cyan for audio,
   purple for embeddings)

2. **Dedicated Entry column** — entry IDs are now in their own column as
   clickable `#ID` links to `/entries/:id`, removing duplication between params
   and details columns

3. **Relative timestamps** — "2h ago", "3d ago" shown alongside absolute dates

4. **Richer ingestion summaries** — ingestion jobs show "250 words, 5 chunks,
   3 pages" instead of just "Entry Id: N" (requires server-side changes from
   the sibling commit in journal-server)

5. **Fixed expanded details text size** — was `text-xs`, now inherits `text-sm`
   from the table to match surrounding text

6. **Hidden internal keys** — `entry_id`, `follow_up_jobs`, `entry_date`, and
   `source_type` are filtered from the expanded details view (shown elsewhere)

7. **Follow-up job status badges** — expanding an ingestion job's details shows
   colored status badges for its mood scoring and entity extraction follow-ups,
   fetched lazily on first expand via `getJob()`

8. **Params column cleanup** — no longer shows `entry_id` (moved to Entry
   column), only shows operational params like `stale_only`, `mode`, date ranges

## Tests

32 tests covering all new features including type badges, entry links,
relative time, ingestion summaries, expanded details filtering, follow-up
job fetching, and pluralization of page/recording counts.

## Sibling commit

Server-side: journal-server `3b81ffc` — enriches ingestion result dicts with
entry metadata and follow-up job IDs.
