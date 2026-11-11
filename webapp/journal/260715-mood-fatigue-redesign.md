# 260715 — Mood/fatigue redesign (webapp side)

Companion to the server entry `260715-mood-fatigue-redesign.md` (journal-server). One
cross-cutting engineering-team cycle; run artifacts in the parent workspace under
`.engineering-team/runs/manual-20260715T102441Z/`.

## 1. Context

The backend split the single `energy_fatigue` mood dimension (energetic↔tired) into four facets —
`energy_vigor`, `tension_calm`, `physical_fatigue`, `mental_fatigue` — and added a divergence
detector plus two new REST endpoints. The webapp had to repoint to the new dimension set, report
tiredness honestly, and surface mood alongside training load. Most of the dashboard is data-driven
from `GET /api/dashboard/mood-dimensions`, so the dimension *list* auto-updated; only a few
hard-coded spots needed changes.

## 2. What shipped (webapp)

1. **Dimension repoint** (`utils/mood-groups.ts`, `utils/mood-display.ts`, `stores/dashboard.ts`,
   `components/dashboard/shared.ts`): the affect group now holds the fatigue/vigor facets and
   `tension_calm` moved to the negative group (keeping the four-group invariant). Added a
   `defaultSelected` field to `MoodGroup` so the group can *contain* all fatigue facets while only
   preselecting a small default (joy + physical_fatigue). `physical_fatigue`/`mental_fatigue` are
   display-inverted ("physically fresh"/"mentally fresh") so "up = good" holds. `MOOD_LINE_COLORS`
   grown 8 → 12 for the 10 dimensions.
2. **Honest tiredness reporting** (`components/dashboard/MoodTrendsChart.vue`, `utils/mood-display.ts`):
   new `displayPolarLabel` shows both poles ("energetic ↔ tired") instead of just the positive one;
   per-point `pointRadius` scales with `entry_count` and the tooltip shows the count, so a one-entry
   week no longer looks as authoritative as a ten-entry week; the header explains the min/max band's
   lower reach = the worst single entry (so acute post-run dips stay visible under the weekly
   average). Fixed the drill-down coloring, which thresholded at 0 and so rendered every unipolar
   entry green — now colors relative to the dimension's neutral midpoint (0 bipolar, `score_max/2`
   unipolar).
3. **Mood × fitness view** (new `components/fitness/MoodFitnessChart.vue`, `types/fitness.ts`,
   `api/fitness.ts`, `stores/fitness.ts`, `views/FitnessView.vue`): a new first FitnessView tile
   overlaying training load / readiness (left axis) against the two fatigue facets (right axis, via
   `displayScore` so up = fresh), plus a divergence card that lists recent
   "feels-tired-but-recovered" and "feels-fine-but-depleted" days with human-readable copy and
   summary counts. Consumes the new `/api/fitness/mood-recovery` and `/api/fitness/divergence`
   endpoints. Graceful empty state when there's no data.

## 3. Gotcha — the cold-load chart bug (caught in code review)

`MoodFitnessChart.vue`'s render watcher used the default `flush: 'pre'`. The canvas lives inside a
`v-else` that only renders once `hasData` is true, and FitnessView loads data *after* mount — so on
cold load the watcher fired before the DOM patch, the canvas didn't exist yet, `renderChart()`
no-oped, and the chart stayed blank until an unrelated re-render. The sibling `MoodTrendsChart.vue`
already documents this exact `flush: 'post'` lesson; the new component didn't carry it over. Fixed by
switching to `flush: 'post'` (and adding `hasData` to the watched deps), plus a regression test that
mounts empty then sets store data and asserts the chart constructs. Also tore down the chart when
data drops to empty (was leaking a detached canvas).

## 4. Verification

Webapp: `1944 passed`, coverage 92.4% stmts / 85.3% branches / 91.5% funcs / 94.7% lines (all ≥85%),
lint + build clean.
