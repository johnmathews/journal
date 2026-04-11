# 2026-04-12 — Batch job UI (entity extraction + mood backfill)

The Entities page had a dead-end empty state: "No entities yet. Run the
extraction batch job to populate them." — but "the extraction batch job"
only existed as a CLI command on the host. Mood scoring was in the same
position (CLI only). This session adds a UI button for both.

The backend half (async job infrastructure) ships as a sibling commit in
`journal-server` — see
`journal-server/journal/260412-async-batch-jobs.md`. The design rationale
for making everything async lives there.

## What shipped

### 1. `BaseModal.vue`

A small, reusable modal primitive — Vue 3.5 `<script setup lang="ts">`,
Tailwind, no dependencies. The webapp's tech-stack doc mentions PrimeVue
but it isn't actually installed — building a custom primitive was simpler
than adding a dependency for one screen.

Features:
- `<Teleport to="body">` so the panel escapes any `overflow-hidden` parent.
- Backdrop click + Escape key close the modal (emits `update:modelValue`).
- Panel click does NOT close — `.stop` on the click handler.
- Focus management on open/close: saves the previously focused element,
  focuses the first focusable descendant inside the panel via `nextTick`,
  restores focus on close.
- Focus trap: Tab/Shift+Tab cycle within the panel's focusable descendants.
- Body scroll lock while open (saves prior `overflow` value so we don't
  clobber other inline styles).
- `role="dialog"`, `aria-modal="true"`, `aria-labelledby` pointing to a
  `useId()`-generated header id.
- `size` prop (`sm` | `md` | `lg`) controls `max-w-*`.
- Slots: `default` (body), `footer` (only rendered when provided).

11 tests in `BaseModal.spec.ts` — open/close behaviour, emits, slot
rendering, keyboard handling, focus, size prop.

### 2. Jobs types + API client

- **`src/types/job.ts`** — `Job`, `JobStatus`, `JobType`,
  `JobSubmissionResponse`, `TERMINAL_JOB_STATUSES`, `isTerminal()`. Fields
  are **snake_case** matching the wire format — consistency with the server
  matters more than prevailing TypeScript conventions for this narrow use
  case.
- **`src/api/jobs.ts`** — `triggerMoodBackfill(params)` and
  `getJob(jobId)`. URL-encodes the job id.
- **`src/api/entities.ts`** — `triggerEntityExtraction` return type flipped
  from the old synchronous `{results: [...]}` to `JobSubmissionResponse`.
- **`src/types/entity.ts`** — removed the obsolete `ExtractionResult` and
  `ExtractionTriggerResponse` interfaces; left a pointer comment to
  `src/types/job.ts`.

5 tests in `jobs.spec.ts` covering POST body shape, mode variants, URL
encoding, and 404 → `ApiRequestError`. Entity test updated to match the new
return type.

### 3. Jobs Pinia store (`src/stores/jobs.ts`)

Tracks multiple concurrent jobs keyed by id. Actions:

- `startEntityExtraction(params)` / `startMoodBackfill(params)` — call the
  respective API, stash a placeholder Job row with `status: "queued"`,
  start polling, return the Job.
- `pollJob(jobId)` — calls `getJob`, writes the result to the store, and if
  the status is non-terminal, schedules the next tick via `setTimeout` at
  1000 ms.
- `stopPolling(jobId)` — clears any pending setTimeout for that id and
  resets the error counter.
- `clearJob(jobId)` — stops polling and removes the row.
- Getters `getJobById` and `activeJobs`.

Two design details worth flagging:

**`setTimeout`, not `setInterval`.** setInterval fires every N ms
regardless of whether the previous tick finished. A slow getJob response
would stack multiple overlapping fetches. Recursive `setTimeout` gives
natural serialisation — the next tick is scheduled *from inside* the
previous tick, after the fetch resolves.

**Two-layer dedup guard.** `pollTimers` (a map of id → timer handle) and
`inFlight` (a Set of ids currently awaiting their fetch). Without the
`inFlight` guard, two callers entering `pollJob` concurrently during the
`await getJob(...)` gap would both pass the `pollTimers.has(id)` check and
issue parallel fetches. The "dedupes concurrent pollJob calls" test uses a
deliberately never-resolving mock to prove the guard holds.

**Transient failure handling.** A `getJob` failure doesn't orphan the job
— polling retries on the next tick. After `MAX_CONSECUTIVE_POLL_ERRORS = 5`
consecutive failures, the store marks the job as failed locally with
`error_message: 'lost connection to server'`. Prevents infinite loops when
the backend is genuinely unreachable.

10 tests in `stores/__tests__/jobs.spec.ts`: placeholder creation, poll
cadence, terminal transitions (succeeded + failed), dedup, stopPolling,
transient error retry, 5-error giveup, `activeJobs` filtering, `clearJob`.

### 4. `BatchJobModal.vue`

Wraps `BaseModal` with a state machine:

```
configure → running → done | error
```

Props: `modelValue`, `title`, `jobKind: 'entity_extraction' | 'mood_backfill'`.
Emits: `update:modelValue` and `job-succeeded` (the parent view listens
and refreshes).

- **configure:** radio (default `stale-only`) + two optional date inputs +
  Cancel / Run buttons. On Run, dispatches to the jobs store and transitions
  to `running`. If the store action throws synchronously, transitions
  directly to `error`.
- **running:** progress bar + `{current} / {total}` counter. Watches the
  store for the local job id and transitions on terminal status. The
  progress bar falls back to an indeterminate pulsing state when
  `progress_total === 0` (between submission and the first `(0, total)`
  callback hitting the server). Close button leaves the job polling in
  the background — deliberately does NOT call `stopPolling`.
- **done:** summary of the aggregated result (counters differ per job
  kind). Close calls `clearJob`.
- **error:** red alert box + error message. Close calls `clearJob`.

State resets to `configure` whenever `modelValue` flips from false to
true. 12 tests covering the full state machine + prop handling.

### 5. View integrations

**`EntityListView.vue`** — "Run extraction" button next to the search
input (violet primary, `data-testid="run-extraction-button"`). Clicking
opens the modal. On `@job-succeeded`, calls
`store.loadEntities({ offset: 0 })` to refresh the list. Empty-state text
updated to point at the button instead of dead-ending.

**`DashboardView.vue`** — "Run mood backfill" button in the mood chart
header (`data-testid="run-mood-backfill-button"`). Clicking opens the
modal with `jobKind="mood_backfill"`. On `@job-succeeded`, calls
`loadMoodTrends()` on the dashboard store and then re-renders the chart.

3 tests each verify the button renders, opens the modal on click, and
triggers the correct refresh on completion.

## Test count

**348 → 366 passing** (+18 across 5 new files / 3 modified files):

| file                         | new tests |
| ---------------------------- | --------- |
| BatchJobModal.spec.ts        | 12        |
| EntityListView.test.ts       | +3        |
| DashboardView.test.ts        | +3        |

(BaseModal + jobs store + jobs API tests landed earlier in the session —
counted in the U7/U8/U9 totals, not repeated here.)

`npm run lint` clean. `npm run build` clean (BatchJobModal is
automatically code-split at 13.31 kB gzipped → 4.51 kB).

## Post-review fixes

Two small issues caught in code review of `BatchJobModal.vue`:

1. **Double-submit guard.** The Run button had no disabled state during the
   `await` inside `onRun`. A double-click — or a second click on a slow
   network — could submit two jobs back-to-back. Added a `submitting` ref
   wrapped in a `try/finally` that disables the button and swaps its label
   to `"Submitting…"` until the submission round-trip returns.
2. **Contradictory comment.** The comment above the `props.modelValue`
   watcher claimed "We do NOT reset on close: the user may be reopening to
   check the tail of an in-flight job" — but the code resets to `configure`
   on every open, losing any progress view. Updated the comment to match
   the actual behaviour; restoring the mid-stream progress view on reopen
   is a genuine follow-up item, not a contradiction to paper over.

## Out of scope (deliberate)

1. Cancellation button — backend doesn't support it for v1.
2. Job history page — store only tracks session-scoped jobs.
3. `dry_run` / `prune_retired` flags for mood backfill — CLI remains the
   power-user interface.
4. Replacing `window.confirm` elsewhere with `BaseModal` — the component is
   now available for future use but no other caller was touched.
5. Toast / notification system for background job completion — the current
   model assumes the user stays on the page while the modal is running.
   A cross-cutting notification system is a larger scope change.
