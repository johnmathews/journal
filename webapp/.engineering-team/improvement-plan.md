# Improvement plan — UI changes (mood-trend defaults, entity casing, stale entities)

Date: 2026-05-06. Based on `.engineering-team/evaluation-report.md`. Worktree:
`eng-ui-changes` in both repos.

## Approach

Cross-cutting work across two repos. Each work unit is scoped to one repo; cross-repo
dependencies (server API → webapp consumer) are called out explicitly. All work happens in
the matching `eng-ui-changes` worktree in each repo, producing two coordinated commits.

## Work units overview

| # | Repo | Title | Priority | Depends on |
|---|---|---|---|---|
| 1 | webapp | Mood-trends default = affect-axes group | High | — |
| 2 | server | Smart entity capitalization (write-time normalization) | Medium | — |
| 3 | server | Entity `is_quarantined` flag + repo + filter | High | — |
| 4 | server | Reject/rename hallucinated names + post-save sanity sweep | High | WU3 |
| 5 | server | Loosen merge-candidate detection for near-duplicate places | Medium | — |
| 6 | server | Docs: existing merge feature + production deployment | Medium | — |
| 7 | webapp | Surface quarantined entities in admin/list UI | Medium | WU3, WU4 |

WU1, WU2, WU3, WU5, WU6 are independent — implement in parallel. WU4 follows WU3. WU7
follows WU3 + WU4.

---

## WU1 — Mood-trends default selection = affect-axes group

**Repo:** webapp. **Priority:** High. **Risk:** Low.

### Why
Ask #1. Today the dashboard defaults to showing only the `agency` series. User wants the
two affect-axes series (`joy_sadness`, `energy_fatigue`) preselected on first load with all
others off.

### Changes

- **Edit:** `src/stores/dashboard.ts`
  - Replace the `DEFAULT_ISOLATED_MOOD = 'agency'` constant (line 127) with a reference to
    the affect-group members from `MOOD_GROUPS`.
  - Rewrite the default-selection logic in `loadMoodDimensions` (lines 240–248) to:
    1. Find the `'affect'` group in `MOOD_GROUPS` (import added).
    2. Filter to members that exist in `response.dimensions`.
    3. If non-empty, set `selectedMoodDimensions` to that set; else fall back to empty
       (which means "show all").
  - Keep the `moodDefaultsApplied` one-shot flag intact.
- **Edit:** `src/stores/__tests__/dashboard.test.ts`
  - Rename and retarget the "isolates agency by default" test to "selects affect axes by
    default".
  - Update assertions in the idempotence test, the fallback regression test, and the
    `moodGroupSelectionState` / `toggleMoodGroup` tests so the initial-state assumption
    matches the new default.
  - Add tests: empty dimensions → empty selection; affect group missing → empty (show-all);
    only one of the two affect members present → selection is just that one.

### Acceptance criteria

1. On a fresh dashboard load, only `joy_sadness` and `energy_fatigue` series appear in
   the chart; all other series toggles are off.
2. The affect-group label visually shows "all selected" (full state).
3. All other group labels show "none selected".
4. User can still toggle freely after load (defaults are not re-applied mid-session).
5. `npm run test:unit` is green; `npm run lint` is clean.
6. Visual verification via Playwright (start `webapp + server + chromadb` per the Local
   Full-Stack Quickstart in `webapp/CLAUDE.md`): page loads, chart shows two series,
   correct defaults; toggling a different group adds those series; no console errors.

---

## WU2 — Smart entity capitalization at write time

**Repo:** server. **Priority:** Medium. **Risk:** Medium (test-fixture churn).

### Why
Ask #2. Entity names today reflect whatever casing the LLM emits — inconsistent.
`running` and `Running` can coexist on the case-sensitive UNIQUE constraint. User wants
smart title-casing applied at write time, with an editable exception list to preserve
`iOS`, `IKEA`, `FC Barcelona`, etc.

### Changes

- **New file:** `config/entity-casing-exceptions.toml`
  - `[meta]` block with `version = "2026-05-06"` and a description, mirroring
    `config/mood-dimensions.toml` style.
  - `[exceptions]` table mapping lowercased key → preserved-case value. Seed with: `iOS`,
    `iPhone`, `iPad`, `iPod`, `macOS`, `IKEA`, `NASA`, `BBC`, `FBI`, `LinkedIn`, `GitHub`,
    `eBay`, `YouTube`, `WhatsApp`, `IBM`, `HP`, `KLM`, `FC Barcelona`, `AC Milan`,
    `the Netherlands` (capital T), `the Hague` (capital T), `Den Haag`, `'t Gooi`,
    `O'Brien`, `McDonald's`, `O'Reilly`. Comment header explaining the format.

- **New file:** `src/journal/services/entity_naming.py`
  - Module-level `_DEFAULT_DUTCH_PARTICLES = {"van", "der", "de", "den", "het", "'t",
    "ten", "ter", "op", "aan"}`.
  - Module-level `_LOWERCASE_ARTICLES = {"of", "the", "and", "for", "in", "on", "at",
    "to", "with", "or", "by"}`.
  - Function `smart_title_case(name: str, exceptions: dict[str, str]) -> str` implementing
    the algorithm from the eval report (steps 1–5). Hyphen-segment-aware
    (`anglo-saxon` → `Anglo-Saxon`).
  - Function `load_entity_casing_exceptions(path: Path) -> dict[str, str]` parsing the toml
    and returning a normalized `lower → preserved-case` map.

- **Edit:** `src/journal/config.py`
  - Add `entity_casing_exceptions_path: Path` field defaulting to
    `config/entity-casing-exceptions.toml`.
  - Add a loaded `entity_casing_exceptions: dict[str, str]` populated at startup. If the
    file is missing, default to `{}` and log a warning (don't crash — the algorithm
    degrades gracefully).

- **Edit:** `src/journal/entitystore/store.py:260–282`
  - Inject the exceptions map (constructor wiring or via the calling service — see below).
  - Replace `canonical_name.strip()` with
    `smart_title_case(canonical_name, exceptions=...)`.
  - Add a docstring noting names are normalized at write time.

- **Edit:** `src/journal/services/entity_extraction.py`
  - Pass the exceptions map through to the store. Either: (a) the store reads from a
    config-injected dependency, or (b) the service applies normalization before calling
    the store. Decision in implementation: prefer (a) — single chokepoint — by passing
    the exceptions map into `SQLiteEntityStore`'s constructor in the wiring layer.

- **Edit:** `src/journal/services/reload.py`
  - Add `reload_entity_casing_exceptions()` mirroring `reload_mood_dimensions()`.
  - Re-read the toml, swap the in-memory dict atomically, re-inject into the store.

- **Edit:** wherever the admin reload routes are registered (likely `auth_api.py` or the
  api module that exposes `/api/admin/reload/{resource}` — discoverable via grep)
  - Add a route handler for `entity_casing` resource.

- **Edit / extend tests:**
  - **New:** `tests/test_services/test_entity_naming.py` — comprehensive cases:
    `running → Running`, `church → Church`, `the netherlands → The Netherlands`,
    `iOS → iOS`, `FC barcelona → FC Barcelona`, `anglo-saxon → Anglo-Saxon`,
    `O'Brien → O'Brien` (via exception), `nasa → NASA` (via exception),
    `den haag → Den Haag`, hyphen edge cases, single-letter words, empty input,
    whitespace-only input, mid-word uppercase preservation.
  - **Update:** any test that asserts an exact `canonical_name` string for fixtures that
    will now title-case differently (e.g. `assert e.canonical_name == "alice"` →
    `"Alice"`). Discoverable via grep in Phase 3 implementation.
  - **Update:** webapp `src/utils/__tests__/entityName.test.ts` — fixtures should reflect
    that DB names are now title-cased, so `displayName` is idempotent.

- **Doc updates:**
  - Add a "Casing normalization" subsection to `docs/entity-tracking.md` describing the
    algorithm and pointing to the exceptions toml.
  - Add an "Entity casing exceptions" entry to `docs/configuration.md` (or wherever the
    operator-config files are listed).

### Acceptance criteria

1. New entities created with lowercase LLM output (`running`) are stored as `Running`.
2. Names with mid-word uppercase (`iOS`, `iPhone`) are preserved verbatim.
3. Names matching an exception entry use the exception's exact casing.
4. Dutch place-name particles in non-leading positions are lowercased (`Jan van Halen`).
5. Hyphen-segments are individually title-cased (`Anglo-Saxon`).
6. `POST /api/admin/reload/entity_casing` re-reads the toml without restarting.
7. Server pytest suite passes including the new `test_entity_naming.py` and all updated
   fixtures.
8. `uv run ruff check src/ tests/` is clean.

---

## WU3 — Entity `is_quarantined` flag

**Repo:** server. **Priority:** High. **Risk:** Low (additive schema change, no destruction).

### Why
Foundation for WU4. The user agreed soft quarantine (hide from charts, keep in DB) is the
safe approach for entities that fail post-extraction sanity checks. We need a column,
repository methods, and default-filter behavior in entity-list / chart endpoints.

### Changes

- **New migration:** `src/journal/db/migrations/0012_entity_quarantine.sql`
  - `ALTER TABLE entities ADD COLUMN is_quarantined INTEGER NOT NULL DEFAULT 0;`
  - `ALTER TABLE entities ADD COLUMN quarantine_reason TEXT NOT NULL DEFAULT '';`
  - `ALTER TABLE entities ADD COLUMN quarantined_at TEXT NOT NULL DEFAULT '';`
  - Add index `CREATE INDEX idx_entities_quarantined ON entities(is_quarantined) WHERE is_quarantined = 1;`

- **Edit:** `src/journal/models.py:Entity`
  - Add fields `is_quarantined: bool = False`, `quarantine_reason: str = ""`,
    `quarantined_at: str = ""`.

- **Edit:** `src/journal/entitystore/store.py`
  - Update `SELECT *` mappers to include the new columns.
  - Update `list_entities()` and `list_entities_with_mention_counts()` to accept an
    `include_quarantined: bool = False` parameter; default behavior excludes quarantined
    rows.
  - Add `quarantine_entity(entity_id: int, reason: str) -> None` — sets the flag and
    timestamp.
  - Add `release_quarantine(entity_id: int) -> None` — clears the flag.
  - Add `list_quarantined_entities(user_id: int) -> list[Entity]`.

- **Edit:** `src/journal/api.py` — entity list endpoint(s)
  - Existing list endpoints exclude quarantined by default.
  - Add `GET /api/entities/quarantined` returning the quarantined list.
  - Add `POST /api/entities/{id}/quarantine` (admin) for manual quarantine.
  - Add `POST /api/entities/{id}/release-quarantine` for manual release.

- **Edit:** chart-data endpoints (entity mention frequency, topic trends, etc.) — confirm
  they go through the list/aggregate methods that filter by default. If not, add the
  filter.

- **Tests:**
  - `tests/test_db/test_migrations.py` — verify migration applies cleanly to a populated DB.
  - `tests/test_entitystore/...` — repository tests for the new methods.
  - `tests/test_api.py` — endpoint tests for quarantine list / set / release.

### Acceptance criteria

1. Migration applies cleanly forward; `pragma user_version` increments correctly.
2. Existing entity list / mention-frequency endpoints exclude quarantined rows by default.
3. New `/api/entities/quarantined` endpoint returns only quarantined rows.
4. Quarantining/releasing an entity persists across queries.
5. All entity test suites green.

---

## WU4 — Reject/rename hallucinated names + post-save sanity sweep

**Repo:** server. **Priority:** High. **Risk:** Medium (touches LLM repair logic).
**Depends on:** WU3.

### Why
Ask #3.1 and #3.2. The actual fix for the `Zij Kanaal C Zuid` symptom. User approved (b)
auto-rename to longest in-quote substring, falling back to (c) soft quarantine.

### Changes

- **Edit:** `src/journal/providers/extraction.py:264–299` (the existing
  `_repair_canonical_name` function and the warn-only path at line 379)
  - Add helper `_longest_substring_in_quote(canonical: str, quote: str) -> str | None`:
    finds the longest prefix-of-canonical that appears in the quote, case-insensitive.
    Whitespace-tolerant (collapse runs of whitespace before comparing).
  - At line 379, **before** the warn-and-keep, try the longest-substring repair. If it
    yields a non-empty result of at least 3 chars, use it as the canonical_name.
  - If repair yields nothing usable, **mark the extraction result with
    `pending_quarantine_reason: str`** so the caller (the extraction service) can flag the
    entity at insert time. Keep the warning log but augment it with the action taken.

- **Edit:** `src/journal/services/entity_extraction.py`
  - At the end of `extract_from_entry()` (after the existing orphan-cleanup at lines
    285–291), iterate over the entities touched in this run and verify each one's
    canonical_name appears in at least one of:
    - any of its mention quotes (across all entries) — substring, case-insensitive,
      whitespace-tolerant; or
    - the current `final_text` of any of its mentioned entries.
  - Entities that fail this check: call `store.quarantine_entity(id, reason="canonical
    name not found in any mention quote or entry text after re-extraction")`.
  - When `_resolve_entity()` creates a new entity that arrived with
    `pending_quarantine_reason`, quarantine it immediately on insert.
  - Log every quarantine at INFO with the entity id, name, and reason.

- **Tests:**
  - `tests/test_providers/test_extraction.py` — new test for the longest-substring repair:
    given canonical `Zij Kanaal C Zuid` and quote `"Zij Kanaal C" Zuid is clearly a canal`,
    the repaired name is `Zij Kanaal C` (or similar).
  - `tests/test_services/test_entity_extraction.py` — new tests:
    - First-extraction with a hallucinated name → entity is created with the repaired name
      (not quarantined).
    - First-extraction with no usable substring → entity is quarantined.
    - Re-extraction after entry edit removes the rationale for an entity → entity is
      quarantined (not deleted).
    - Reproduction-style test mimicking the `Zij Kanaal C Zuid` flow: ingest entry, edit
      text to remove the stray `Zuid`, re-extract → entity is renamed to
      `Zij Kanaal C` or quarantined (depending on whether the substring repair succeeds at
      first-extraction time before the edit).

### Acceptance criteria

1. The `Zij Kanaal C Zuid` reproduction-style test passes — after entry edit, the entity
   either (a) ends up renamed to `Zij Kanaal C`, or (b) is quarantined with a clear reason.
2. Existing extraction tests still pass (modulo updated assertions reflecting the repair).
3. Logs at INFO clearly say what action was taken (`renamed canonical_name from X to Y` /
   `quarantined entity Z: reason`).
4. No DB rows are deleted by this work unit (quarantine is soft).

---

## WU5 — Loosen merge-candidate detection for short multi-word names

**Repo:** server. **Priority:** Medium. **Risk:** Low.

### Why
Ask #3.3. Three near-duplicate `Zij Kanaal C *` rows in prod were not flagged as merge
candidates. The detector is too strict for short multi-word place names.

### Changes

- **Edit:** the merge-candidate detector. Discover via grep for `merge_candidate` /
  `MergeCandidate` — likely lives in `src/journal/services/merge_candidates.py` or
  similar.
- **Add a complementary heuristic alongside the existing embedding-distance threshold:**
  for entities of the same `entity_type`, compute a normalized signature
  `_normalize_for_compare(name) = re.sub(r"\s+", "", name.lower())`. If two entities'
  signatures are equal or one is a substring of the other and the *non-overlapping* part
  is short (≤ 4 chars or a single word), flag them as a candidate.
- **Tests:** new test cases in `tests/test_services/test_merge_candidates.py` (or
  equivalent) covering:
  - `Zijkanaal C Weg` and `Zij Kanaal C Weg` flagged.
  - `Zij Kanaal C Weg` and `Zij Kanaal C Zuid` flagged.
  - Unrelated short names not flagged (`Amsterdam` vs `Rotterdam`).

### Acceptance criteria

1. New tests pass.
2. Existing detector tests still pass.
3. Manually running the detector on the prod DB (out-of-scope for the worktree but
   verifiable post-merge) flags the three `Zij Kanaal C *` rows.

---

## WU6 — Documentation: existing merge feature + production deployment

**Repo:** server. **Priority:** Medium. **Risk:** None (docs only).

### Why
Ask #3.4 + general doc gap. The merge feature is fully implemented and works; documenting
it stops future-Claude (and future-user) from re-inventing it. The production environment
is currently undocumented — operator and future-debug context lives only in shell history
and `ssh media` muscle-memory.

### Changes

- **Edit:** `docs/entity-tracking.md`
  - New section "Merging entities" covering: API endpoint, payload, semantics (mentions
    reassigned, absorbed canonical names become aliases, history snapshot in
    `entity_merge_history`); UI flow (multi-select on `EntityListView`, modal with radio
    survivor picker); merge-candidate review queue.
  - Cross-reference the dev log entry `journal/260412-entity-management.md`.
  - Add a "Quarantine" subsection (added by WU3/WU4) describing what quarantine means
    (soft-hide), how entities get quarantined, and how to release them.
  - Add a "Casing normalization" subsection (paired with WU2).

- **New file:** `docs/production-deployment.md`
  - Sections: Host, Compose layout, Containers (image, ports, restart policy, bind mounts),
    Image source & update workflow, Public exposure (Cloudflare Tunnel reference),
    Operational commands (logs, restart, DB query, backup target).
  - Explicitly call out: `:latest` pinning, no auto-update, manual
    `docker compose pull && up -d` workflow.

### Acceptance criteria

1. `docs/entity-tracking.md` has Merging, Quarantine, and Casing-normalization sections
   that match the actual code (verified against api.py, store.py).
2. `docs/production-deployment.md` exists and matches the prod-investigation findings.
3. Both docs render cleanly (mdbook/markdown linter if present, otherwise visual review).

---

## WU7 — Webapp: surface quarantined entities

**Repo:** webapp. **Priority:** Medium. **Risk:** Low. **Depends on:** WU3 + WU4.

### Why
The user needs to see what's been quarantined and either release back to active or merge
into a survivor. Without UI, quarantine is invisible to operators.

### Changes

- **Edit:** `src/api/entities.ts` — add `fetchQuarantinedEntities()`,
  `releaseQuarantine(id)`, `quarantineEntity(id, reason)` clients matching the new
  endpoints.

- **Edit:** `src/views/EntityListView.vue`
  - Add a quarantine badge to entity rows when `entity.is_quarantined === true` (the list
    endpoint may need an `include_quarantined=true` query param if we want them visible in
    a special view).
  - Add a "Quarantined" tab/filter at the top alongside the entity-type filter.
  - In the row context menu (or the entity detail view), add "Release from quarantine" and
    "Merge into existing entity..." actions.

- **Edit:** `src/views/EntityDetailView.vue`
  - Show quarantine reason and timestamp when applicable.
  - "Release" button if quarantined.

- **Tests:**
  - `src/views/__tests__/EntityListView.test.ts` — quarantined badge renders, filter
    toggles work, release action calls API.
  - `src/views/__tests__/EntityDetailView.test.ts` — quarantine details visible.

### Acceptance criteria

1. Quarantined entities are excluded from the default entity list.
2. The Quarantined filter shows them.
3. Release-from-quarantine action moves the entity back to active state.
4. Existing merge UI handles a survivor that is currently quarantined gracefully.
5. `npm run test:unit` green; coverage thresholds met.
6. Visual verification via Playwright: navigate to entity list, switch to Quarantined
   filter, see at least one quarantined entity in dev seed; release one; verify it returns
   to default view.

---

## Out-of-scope (flagged for follow-up)

1. **Backfill of pre-existing duplicate-case entity rows.** Once WU2 ships, future writes
   will be consistent. Existing prod rows like potential `running` + `Running` pairs
   stay as-is; user can use the merge UI to clean them up. Surfacing those duplicates as
   merge candidates may benefit from WU5's relaxed heuristic.
2. **Production image pinning / Watchtower.** Currently `:latest` everywhere with manual
   updates. Documented in WU6 but not changed.
3. **Embedding-matcher improvement** — long-term, the matcher should weigh canonical-name
   substring overlap higher than pure embedding distance to avoid the kind of false-merge
   that produced the `Zij Kanaal C Zuid` symptom. WU4's post-save sanity sweep is a
   pragmatic compensating control.

## Risk summary

The highest-risk unit is WU4 — it touches the LLM repair path that produces real entities.
Mitigations: comprehensive test coverage (the reproduction test pinned to the prod incident),
soft-quarantine instead of delete, clear logs of the action taken on every entity. Failures
are recoverable by manual release-from-quarantine + merge.

WU2's risk is purely test-fixture churn. WU1, WU3, WU5, WU6, WU7 are low-risk.
