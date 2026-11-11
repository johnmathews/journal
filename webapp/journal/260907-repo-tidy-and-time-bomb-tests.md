# Repo tidy-up, and the two tests that rotted on their own

**Date:** 2026-09-07
**Branch:** `chore/tidy-webapp` → PR #38

## What prompted it

The webapp repo root had accumulated 28 stray verification PNGs — more
screenshots than source directories in a plain `ls`. The ask was a general
tidy: remove old files, reap what we can.

## What was actually there

All of it gitignored, none tracked, so the cleanup was a working-directory
operation and touched no history:

| Thing                                  | Size    | Why it was there                           |
| -------------------------------------- | ------- | ------------------------------------------ |
| 28 root PNGs                           | 2.7 MB  | ad-hoc UI verification, 2026-05-03 → 05-09 |
| `screenshots/`, `journal/screenshots/` | ~0.3 MB | dated verification runs from April/May     |
| `.pytest_cache/`, `.ruff_cache/`       | 712 KB  | **server** tooling run with webapp as cwd  |
| `.superpowers/`                        | 412 KB  | stale review diffs                         |
| `coverage/`, `dist/`                   | 5.7 MB  | regenerable                                |

Server had the same shape: `htmlcov/` (18 MB), `.coverage`, and the same
three cache directories. ~31 MB reclaimed across both repos.

## The two `.gitignore` defects underneath

Deleting files was the easy half. Two rules were why the mess stayed
invisible:

1. **`webapp/.gitignore` ended with an unanchored `*.png`.** That ignores
   every PNG at any depth, forever. Nothing legitimate was suppressed today
   (the app ships no image assets), but any future favicon or docs diagram
   would be silently untracked. It is also what hid `journal/screenshots/`.
   Replaced with `/*.png` — root-only, which is where the clutter actually
   lands.
2. **`server/.gitignore` never ignored its own tool caches.**
   `git check-ignore -v` said NOT IGNORED for `.pytest_cache`,
   `.ruff_cache` and `.superpowers`. They stayed out of `git status` purely
   because pytest and ruff each write a `.gitignore` containing `*` inside
   their own cache. That is cleanliness borrowed from third-party tools,
   not asserted by the repo.

`server`'s `*.png` was deliberately left alone — there it sits under
"personal content" and over-ignoring is the safe direction.

## The part that wasn't a tidy-up at all

`main` was red. Two `FitnessView` tests failed on a clean checkout, and CI
had been **green on the exact same commit** on 2026-07-21 — with the
installed dependency tree matching `package-lock.json` exactly.

The cause: fixtures dated to the week of 2026-05-04, checked against a
store default range of `last_3_months` measured from `new Date()`
(`src/stores/fitness.ts:184-195`). While the tests were written those dates
sat inside the window. Once real time drifted past three months, every
activity fell outside it, `bucketByWeek` matched no bucket, and the
duration series summed to 0. A three-month fuse, lit on the day it was
written.

The second failure was collateral, and the mechanism is worth remembering:
the first test threw _before_ reaching `wrapper.unmount()`, so its
component stayed mounted. That orphan kept reacting to the shared
`fitness:maWindow` storage, so clicking the 5-day button rendered two sleep
charts — and `sleepChartConfig()` uses `.find()`, which took the stale
empty one:

```
[{"label":"5-day avg","len":0,"data":[]},
 {"label":"5-day avg","len":3,"data":[80,80,80]}]
```

**One failing test can manufacture a second, unrelated-looking failure** by
leaking a mounted component. Worth checking for that shape before chasing
two bugs.

Fixed by pinning `"now"` to 2026-05-10 with `vi.useFakeTimers({ toFake:
['Date'] })` — only `Date` faked, so timers stay real and `flushPromises()`
is unaffected. Re-dating the fixtures or widening the range would only have
reset the fuse.

## Lessons

- **A test that hard-codes dates against a today-relative window has a
  fuse, not a bug.** It passes review, passes CI, and fails months later
  with no commit to blame. Freeze the clock at write time.
- **Green CI on a commit is not a claim about that commit forever.** `main`
  had no CI run between 2026-07-21 and today; the rot was invisible because
  nothing re-ran.
- **`.gitignore` rules that over-match hide the mess they create.** The
  unanchored `*.png` is why nobody noticed 28 screenshots accumulating.
- Other test files pair hard-coded 2026 dates with today-relative logic and
  could rot identically. Not audited — a follow-up worth doing.

## Left alone deliberately

- Three stale local branches (`chore/upload-artifact-node24`,
  `feat/dashboard-all-series-tooltips`, `feat/storyline-chapters`), each
  holding commits not in `origin/main` since 2026-06-14. All track live
  remotes, so `clean_gone` won't reap them and deleting them loses work.
- `server` is parked on an unmerged branch
  (`docs/storylines-rollout-migration-renumber`) — left exactly as found;
  the server `.gitignore` branch was cut from `main` instead.
- `server/.local-journal.db` — untouched since 2026-05-02 and probably
  superseded by `journal.db`, but it holds personal content and nothing
  proved it dead.
