# Evaluation report — UI changes (mood-trend defaults, entity casing, stale entities)

Date: 2026-05-06. Cross-cutting: webapp + server. Scope is the three asks; this is **not** a
project-wide audit. Worktree: `eng-ui-changes` in both repos.

## Executive summary

1. **Ask #1 (mood-trends default)** is a one-line constant change in the dashboard store, plus
   test updates. The webapp already has `MOOD_GROUPS` with an `'affect'` group whose members
   are exactly `joy_sadness` and `energy_fatigue` — no server change needed. There is no
   localStorage persistence, so the new default takes effect on the next page load.
2. **Ask #2 (smart entity capitalization)** has a single chokepoint to hook
   (`SQLiteEntityStore.create_entity()` at `entitystore/store.py:260`). No backfill required,
   but a `(user_id, entity_type, canonical_name)` UNIQUE constraint exists with case-sensitive
   collation — `running` and `Running` can coexist as separate rows today. After the fix,
   new writes will be consistent; pre-existing duplicates stay as-is until manually merged.
3. **Ask #3 is misdiagnosed.** The orphan-cleanup logic *already works*. The `Zij Kanaal C
   Zuid` entity is **not** orphaned — it has one live mention (id 2742) on entry 83 with the
   *current* extraction-run UUID and the *current* text. The real bug is upstream: an LLM
   hallucination on the initial extraction was preserved by a warn-but-keep policy at
   `extraction.py:379`, and on re-extraction the embedding matcher re-bound the corrected
   quote to the same hallucinated entity. User has approved (b) auto-rename to longest
   in-quote substring, falling back to (c) soft quarantine when no substring works.
4. The **merge feature is fully implemented** (REST + UI) but **missing from
   `docs/entity-tracking.md`** — that gap is what made it look like the feature didn't exist.

## Project overview

Two-repo stack (cross-cutting changes produce two commits, one per repo):

- **server/** — Python 3.13, FastMCP + custom routes, SQLite + ChromaDB, Anthropic + OpenAI.
  Entity extraction lives in `services/entity_extraction.py`; entity storage in
  `entitystore/store.py`. Operator-managed config follows the `config/*.toml` + admin reload
  pattern (`config/mood-dimensions.toml` and `services/reload.py`).
- **webapp/** — Vue 3.5 + TS, Pinia store, Chart.js. Mood-trend logic in
  `stores/dashboard.ts` + `utils/mood-groups.ts`. Entity views in
  `views/EntityListView.vue` (merge UI, lines 135–635) and `views/EntityDetailView.vue`.

Production deployment (newly documented, see *Production environment* section below): three
containers (`journal-server`, `journal-webapp`, `journal-chromadb`) on the `media` VM under
`/srv/media/docker-compose.yml`, all pinned to `:latest` from `ghcr.io/johnmathews/`. **No
auto-update** — operator runs `docker compose pull && up -d` manually.

---

## Detailed findings

### 1. Mood-trend default selection — small change, low risk

**Current behavior** (`webapp/src/stores/dashboard.ts:240–248`):

```typescript
if (!moodDefaultsApplied && response.dimensions.length > 0) {
  const hasAgency = response.dimensions.some((d) => d.name === DEFAULT_ISOLATED_MOOD)
  selectedMoodDimensions.value = hasAgency
    ? new Set([DEFAULT_ISOLATED_MOOD])
    : new Set()
  moodDefaultsApplied = true
}
```

`DEFAULT_ISOLATED_MOOD = 'agency'` (line 127). Default is *agency only*. The
`moodDefaultsApplied` flag prevents re-applying defaults after the user toggles within a
session.

**Group source of truth.** `webapp/src/utils/mood-groups.ts:35–64` declares `MOOD_GROUPS`
with the `'affect'` group's members being exactly `['joy_sadness', 'energy_fatigue']` (line
39). The server's `config/mood-dimensions.toml` does not carry group IDs — wiring is
webapp-side only. Source of truth for "what's in the affect group" is `mood-groups.ts`,
and it already has the right answer.

**Persistence.** None — no localStorage, no URL state. New default applies on next reload.

**Change site.** Single change in `dashboard.ts`: replace the `agency` default with
`MOOD_GROUPS.find(g => g.id === 'affect').members` filtered to dimensions that exist in
the response. Fall back to empty (= show-all) if the affect group is missing or both members
are absent.

**Tests to update** (`webapp/src/stores/__tests__/dashboard.test.ts`):
- L245–261 `loadMoodDimensions isolates agency by default on first load` — rename + retarget.
- L274–283 idempotence test — assertion update only.
- L389–401 fallback regression test — comment + initial-state update.
- L414–447 `moodGroupSelectionState` and `toggleMoodGroup` tests — initial-state assumes agency.
- Add: returns empty when affect group missing; respects partial availability.

**Risk:** **[VERIFIED LOW]**. Pure default-state change, no backend touch, no migration.

---

### 2. Smart entity capitalization — single chokepoint, with a collision caveat

**Single write chokepoint.** `SQLiteEntityStore.create_entity()` at
`server/src/journal/entitystore/store.py:260–282`. Currently applies only
`canonical_name.strip()`. Called only from `EntityExtractionService._resolve_entity()` at
`server/src/journal/services/entity_extraction.py:487`. **No other path inserts into
`entities`.**

**Schema risk.** Migration `0011` defines `UNIQUE(user_id, entity_type, canonical_name)`
under SQLite default `BINARY` collation. Lookups already use `LOWER(canonical_name)` (lines
235, 252) so matching is case-insensitive *for reads*; but the unique constraint itself
isn't, meaning `running` + `Running` can coexist if the LLM emits both at different times.
The prod data already shows three near-duplicate `Zij Kanaal C *` rows of similar
character — see Finding 3.

**Frontend display.** `webapp/src/utils/entityName.ts:115–138` already applies a title-case
`displayName()`. After we normalize at write time it becomes idempotent (`Running` →
`Running`). Leave it in place as a safety net for legacy rows.

**Algorithm sketch** (final version goes in `server/src/journal/services/entity_naming.py`):

1. `strip()` whitespace.
2. Lookup in exception table by exact-match-lowercased: if hit, use the table's exact casing.
3. If the input has any uppercase letter past index 0 (`iOS`, `FC Barcelona`, `iPhone`,
   `GitHub`), preserve verbatim — assume the LLM gave us a deliberate casing.
4. Otherwise word-by-word title-case, with a known list of articles/prepositions
   (`of, the, and, for, in, on, at, to, with`) and Dutch particles
   (`van, der, de, den, het, 't`) lowercased except in word-1 position. Hyphens
   title-cased per segment.
5. Examples: `running → Running`, `church → Church`, `the netherlands → The Netherlands`,
   `iOS → iOS`, `FC barcelona → FC Barcelona`, `anglo-saxon → Anglo-Saxon`.

**Config file.** New `server/config/entity-casing-exceptions.toml` follows the
`mood-dimensions.toml` operator-config pattern. Hot-reload via existing
`/api/admin/reload/{resource}` endpoint (`services/reload.py:99–161`) — add a
`reload_entity_casing_exceptions()` helper. The Admin Server tab gets a "Reload entity
casing" button consistent with the existing "Reload mood dimensions" button.

**Tests to update**:
- `server/tests/test_entitystore/...` — assertions on `canonical_name` happy-path fixtures
  (`alice`, `john`, `charlie`, `prayer`, etc.).
- `server/tests/test_services/test_entity_extraction.py` — `_entity("John", ...)` calls.
- `server/tests/test_api.py` — multiple `assert item["canonical_name"] == "Alice"` etc.
- New `tests/test_services/test_entity_naming.py` covering positives, exceptions, mid-word
  uppercase, Dutch particles, hyphens, edge cases.

**Risk:** **[VERIFIED MEDIUM]**. Behavior change at write time. Existing data unaffected.
Big risk is **stale-test-fixture churn** — many tests assert exact strings — and
pre-existing duplicate-case rows in prod that will need a manual merge after the change goes
live. Merge UI already supports this.

---

### 3. "Stale entity" — root cause is upstream LLM/matcher, not orphan cleanup

**Conclusion: the orphan cleanup is correct. The reported symptom comes from a different
bug.** This is the most important finding in this evaluation.

**Evidence from prod** (`media:/srv/media/config/journal/data/journal.db`):

Three near-duplicate place entities exist:

```
id 618  Zijkanaal C Weg     created 2026-04-21
id 733  Zij Kanaal C Weg    created 2026-05-05
id 745  Zij Kanaal C Zuid   created 2026-05-06   ← this one
```

Entity 745 has **one live mention** (id 2742) on entry 83, recorded at
`2026-05-06T08:22:23Z` with `extraction_run_id b3b63478-…`. The mention's `quote` is
`""Zij Kanaal C" is clearly a canal"` — pulled from the *current* entry text. Entry 83's
current `final_text` does contain `"Zij Kanaal C" is clearly a canal` and `Kanaal C`, but
**does not contain `Zuid`** anywhere. So the entity is *not* orphaned; the orphan cleanup
correctly leaves it alone (mention count = 1 > 0).

**What actually happened** — confirmed by the server log:

```
2026-05-06 10:14:34 WARNING journal.providers.extraction —
  LLM returned canonical_name 'Zij Kanaal C Zuid' that does not appear in
  its quote '"Zij Kanaal C" Zuid is clearly a canal'
  — keeping as-is, no repair candidate found
2026-05-06 10:14:35 INFO    Created entity 745: Zij Kanaal C Zuid (place)
```

Sequence:
1. **10:14:02** — entry 83 ingested.
2. **10:14:16** — first extraction; LLM hallucinated `Zij Kanaal C Zuid` from a quote
   `"Zij Kanaal C" Zuid is clearly a canal` (the OCR'd `weg` segment plus a separate stray
   `Zuid`). `extraction.py:379` warned but kept the entity.
3. **10:21:48** — user fixed the OCR (`weg` → corrected text), removing the stray `Zuid`.
4. **10:22:04** — re-extraction. Result: `0 new / 15 matched, 15 mentions, 17 relationships,
   0 orphans pruned`. The matcher re-bound the *corrected* quote to the *existing*
   hallucinated entity 745 — likely via embedding similarity. The orphan GC then correctly
   observed that 745 still has a mention and skipped it.

**Three real defects:**

1. `extraction.py:379` warns but doesn't reject when canonical_name isn't a substring of any
   of its quotes. The warning logs in prod, but the entity is created.
2. No re-extraction self-check. When an entity gains its first new mention after an entry
   edit, nothing verifies the canonical name still appears in any of its mentions' quotes.
3. Near-duplicate detection misses obvious place variants — three `Zij Kanaal C *` rows
   should have been flagged as merge candidates; they weren't.

**What the user asked for** (auto-delete entities with zero mentions on save) **already
exists** at `entity_extraction.py:285–291` and `api.py:481–498`. The orphan-cleanup snapshots
prior entity IDs, deletes old mentions, runs new extraction, then calls
`delete_orphaned_entities()`. Verified working — prod log says `0 orphans pruned` because
no entity *became* orphaned.

**Implication for the plan.** What needs to ship for ask #3:

1. Make `extraction.py` **rename or quarantine** entities whose canonical_name fails the
   substring check, instead of just warning.
2. Add a sync **post-save sanity sweep**: for any entity touched in this run, verify its
   canonical name appears in at least one mention quote *or* one entry's text; if not, soft
   quarantine the entity (flag, don't delete). User confirmed soft-quarantine is acceptable.
3. **Loosen near-duplicate detection** for place-type entities (whitespace-insensitive
   compare; substring overlap heuristic). The merge-candidate review queue is in place.
4. **Document the merge feature** in `docs/entity-tracking.md`.

**Risk:** **[VERIFIED MEDIUM]**. Touches the extraction provider (sensitive — LLM prompt +
repair logic) and merge-candidate detector. Soft quarantine is additive — no data loss.

---

### 4. Merge feature documentation gap

**Implementation status** — fully implemented:

- **API:** `POST /api/entities/merge` at `server/src/journal/api.py:2691–2750`. Payload
  `{survivor_id, absorbed_ids[]}`. Reassigns mentions, relationships, aliases; absorbed
  canonical names become aliases on the survivor; `entity_merge_history` for audit.
- **Storage:** `SQLiteEntityStore.merge_entities()` at `entitystore/store.py:664–750`.
- **UI:** `webapp/src/views/EntityListView.vue:135–635` — checkboxes (485–488),
  "Merge selected" button (350–366), modal with radio-button survivor picker (566–627).
- **Merge candidates** — `EntityListView.vue:188–194` shows a candidate review section.

**Documentation status** — `server/docs/entity-tracking.md` has **no merging section**.
Coverage exists only in dev log `server/journal/260412-entity-management.md`.

---

### 5. Production environment — currently undocumented

Verified via `ssh media`:

- **Compose root:** `/srv/media/docker-compose.yml`, env at `/srv/media/.env`, project name
  `media` (multi-service: journal alongside sonarr/radarr/qbittorrent/etc.).
- **Containers:**
  - `journal-server` — `ghcr.io/johnmathews/journal-server:latest`, port 8400, restart
    `always`. Bind mounts: `/srv/media/config/journal/data → /data` (DB),
    `/srv/media/config/journal/context → /app/context`,
    `/srv/media/config/journal/mood-dimensions.toml → /app/config/mood-dimensions.toml` (ro).
  - `journal-webapp` — `ghcr.io/johnmathews/journal-webapp:latest`, port 8402, restart
    `unless-stopped`.
  - `journal-chromadb` — `ghcr.io/johnmathews/journal-chromadb:latest` (custom image), port
    8401, healthcheck OK. Bind mount `/srv/media/config/journal/chromadb → /data`.
- **Image pinning:** `:latest` for all three. **No Watchtower / cron / systemd timer** for
  auto-update. Updates manual: `cd /srv/media && docker compose pull && up -d`.
- **Public exposure:** none directly on `media`. Cloudflare Tunnel runs on a separate
  tailnet host (`100.117.104.102 cloudflared`), fronting `media:8402`.
- **DB on host:** `/srv/media/config/journal/data/journal.db` (12.6 MB). No `sqlite3` binary
  on host or in `journal-server` — query via `docker exec journal-server python3 -c '...'`.

**Out-of-scope finding worth flagging:** running on `:latest` with no auto-update is fragile.
Pinning to SHAs (or running Watchtower with a label allowlist) would be a meaningful
robustness improvement. Not part of this work.

---

## Assessment dimensions (this slice only — not a project audit)

| Dimension | Rating | Justification |
|---|---|---|
| Simplicity (changes proposed) | 5/5 | Each change is the minimum viable addition. |
| Robustness (extraction) | 2/5 | LLM hallucination passes through with only a warning. |
| Robustness (orphan cleanup) | 5/5 | Already correct; verified in prod. |
| Robustness (merge-candidate detector) | 3/5 | Misses obvious near-duplicates for place names. |
| Test coverage of changed areas | 4/5 | Both repos have solid coverage; assertion churn expected. |
| Documentation accuracy | 3/5 | Merge feature undocumented; prod env undocumented. |

## Bug candidates

1. **[VERIFIED]** `extraction.py:379` warns but doesn't reject canonical names absent from
   their source quote. Caused the `Zij Kanaal C Zuid` hallucination.
2. **[VERIFIED]** No post-extraction sanity check that an entity's canonical name still
   appears in at least one mention quote / entry text after re-extraction.
3. **[SUSPECTED]** Merge-candidate detector threshold/distance metric is too strict for
   short multi-word place names.
4. **[VERIFIED]** Entity casing inconsistent at write time — the LLM controls the casing.
   Will produce duplicates on the case-sensitive UNIQUE constraint over time.
5. **[VERIFIED]** Mood-trends default of `agency` doesn't match user expectation.
6. **[VERIFIED]** Merge feature undocumented; prod environment undocumented.

## Gap analysis

- No `entity-casing-exceptions.toml` (to be created).
- No `services/entity_naming.py` (to be created).
- No `is_quarantined` flag on entities (to be added).
- No "Merging entities" section in `docs/entity-tracking.md`.
- No `docs/production-deployment.md`.
- No reload helper for `entity_casing` in `services/reload.py`.
