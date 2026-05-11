# Fitness follow-up F2–F8 shipped — dedup, layout, charts, docs

Date: 2026-05-11. Plan:
[`server/docs/archive/fitness-followup-plan.md`](../../server/docs/archive/fitness-followup-plan.md)
(closed same day; lives on the server side because the plan was cross-cutting and the multiuser
plan it follows was already there).

## What landed

Seven webapp work units out of the F1–F8 batch (F1 is server-side; see the server's journal
entry from today):

- **F2** — Replaced the start-time-plus-duration-tolerance cross-source dedup with time-window
  overlap matching at ≥75% of the shorter duration. The 2026-05-09 case (42m Strava / 41m
  Garmin) that motivated the plan now collapses to one entry labelled "Strava + 1 mirror".
  Constants renamed: `DEDUP_START_TOLERANCE_MS` (90s) + `DEDUP_DURATION_TOLERANCE_S` (30s) →
  `DEDUP_OVERLAP_THRESHOLD` (0.75).
- **F3** — Settings became tabbed (Profile / Notifications / Fitness / Maintenance) mirroring
  the `/admin` pattern. Hash-driven so `/settings#fitness` still works for deep-links from
  the FitnessAuthBanner Reconnect button.
- **F4** — Extracted Strava + Garmin sync panels from `/fitness` into a new
  `FitnessSyncPanels.vue` mounted under Settings · Fitness. `/fitness` now carries a single
  "Manage sync → Settings · Fitness" deep-link in their place.
- **F5** — `RangeBinControls.vue` extracted from `DashboardView` and adopted on both Dashboard
  and `/fitness`. Identical UX everywhere. Fitness store gained `range`, `bin`, `dateWindow`,
  `setRange`, `setBin`.
- **F6** — `buildLineChartOptions()` helper in `chartjs-config.ts`. Fitness line charts +
  stacked-bar adopt the dashboard's `interaction.mode='index'` for vertical-crosshair tooltips
  on hover. The dashboard's own line charts didn't migrate to the builder yet — their tests
  assert specific options shapes, so they're a separate follow-up.
- **F7** — `movingAverage3()` helper, two-dataset render on Sleep / HRV / RHR (bold MA at
  `order: 1`, faded daily at `order: 2`). The centred-3 helper truncates the window at series
  edges so the line spans the full date range.
- **F8** — `docs/chart-style-guide.md` documenting the shared conventions, the builder recipe,
  and the bold-MA-over-faded-daily pattern. Linked from `CLAUDE.md` and `architecture.md` so
  it's discoverable.

Coverage stayed above the 85% gate (85.02% branches after the new code) — added two extra
`FitnessSyncPanels` tests for the null sync-status fallback and the unknown auth-status enum
case to keep the branch count above threshold.

## What I'd do differently

1. **Don't trust subagent consensus on subtle UI quality questions.** F6's spike note flagged
   the risk that dashboard / fitness chart options divergence was broader than expected. I
   trimmed scope to fitness-only adoption of the builder (dashboard line charts didn't migrate
   because their tests assert specific options shape). That was the right call here, but the
   user's post-deploy review surfaced *more* divergence than F6 caught — the tooltip
   implementation gap and the entire missing tile-layout customization. The spike caught one
   layer; a real side-by-side browser review (which I couldn't do) would have caught both.
2. **Test brittle assertions on chart options should be looser.** The dashboard tests that
   pinned specific options shapes blocked the F6 builder adoption. A future cleanup pass
   should let those tests assert *behaviour* (renders, has crosshair, legend toggles) rather
   than *config shape*.
3. **Plan dedup acceptance criterion missed the "input not mutated" property.** Added it as a
   late test (`does not mutate the caller-supplied array order`). For a refactor of a hot pure
   function called by computeds, this should have been in the plan's acceptance list from the
   start.

## Cross-references

- Plan (closed): [`server/docs/archive/fitness-followup-plan.md`](../../server/docs/archive/fitness-followup-plan.md)
- Server counterpart: [`server/journal/260511-fitness-followup-f1-shipped.md`](../../server/journal/260511-fitness-followup-f1-shipped.md)
- Follow-on plan: [`server/docs/fitness-tile-layout-plan.md`](../../server/docs/fitness-tile-layout-plan.md)
  — brings the dashboard's tile customization (rearrange, hide/show, wide/narrow) to `/fitness`
  and closes the remaining tooltip-parity gap the user flagged on the deploy. Largest unit (T2:
  `TileGrid` extraction) is high-risk because it touches the dashboard's working tile rendering.
