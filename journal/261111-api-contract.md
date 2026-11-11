# API contract rollout

**Date:** 2026-11-11

> Purpose
>
> Records how the server/webapp API contract was built (work units W10 to W17 of the monorepo-merge run), the decisions
> behind it, the bugs it surfaced and the follow-ups it left. How to use the contract is in
> [`docs/api-contract.md`](../docs/api-contract.md).

## 1. What was built

The webapp's 14 hand-written type files had drifted from what the server sends. The entity page showed blank names for
related entities because the relationships endpoint never sent them. Nothing could detect drift like that. Every 2xx
REST response body is now a strict `TypedDict`, exported to `contract/api.schema.json`, and the webapp's types are
generated from it.

| Units | What | PR |
| --- | --- | --- |
| W10 to W12 | Schema registry and `journal contract export`, the runtime check in every API test client, the route coverage test with its allowlist, webapp type generation and `contract:check` in CI and the hook | #32 (`d0b59ba`) |
| W13 | Entries, entities, jobs (17 routes) | #35 (`0271bb1`) |
| W14 | Dashboard, search, storylines (23 routes) | #36 (`30f0b68`) |
| W15 | Settings, health, auth, users, notifications, admin (32 routes) | #37 (`6848e3f`) |
| W16 | Fitness (15 routes) | #38 (`6b01bd6`) |
| W17 | Conversations, entity merge and quarantine, ingestion (20 routes), the shared error shape, the empty allowlist, `docs/api-contract.md` | #39 |

The allowlist started at 107 routes and is now empty with `ceiling: 0`, so every new route must register a response
shape. All 108 registered routes are validated by at least one API test, except the `204` conversation delete, which
has no body.

## 2. Decisions

- **D6, the design.** One strict `TypedDict` per body (`extra="forbid"`), exported with Pydantic's
  `TypeAdapter.json_schemas` and turned into TypeScript with `json-schema-to-typescript`. A server test validates every
  2xx body, and CI fails when the generated TypeScript is stale. OpenAPI was rejected because nothing emits it for
  FastMCP's `custom_route`, and the payoff needed a client rewrite. Shared fixtures alone were rejected because they
  give no single source of truth.
- **The CLI is argparse.** `journal contract export [--output PATH]` is a nested subparser.
- **The `TypedDict` class name is the TypeScript name.** The schema root `JournalApi` maps route names to `$defs`, and
  each definition's title is its key. Docstrings export as doc comments.
- **`contract:check` compares in memory** instead of running `git diff`, so it also catches a missing or untracked
  file and leaves the tree clean.
- **Prettier is pinned to `~3.8.1`.** The generator depends on Prettier 3.9+, which would have reformatted 12 files.
- **No `from __future__ import annotations` in `schemas.py`, and no `json_schema_serialization_defaults_required`.**
  Both made `NotRequired` keys export as required. A test guards both.
- **One route name with several methods gets a union alias**, for example `EntryDetailResponse`.
- **Keyword keys use the functional `TypedDict` form** (`from` in dashboard bodies).
- **`JobType` is a `Literal`** checked against every `.create(...)` call in `src/`, with the legacy
  `storyline_generation` kept for old rows.
- **Routes with no API test got their first one** (three dashboard routes in W14), so the runtime check runs on them.
- **W17: shared shapes outside the routes.** `ErrorResponse` is listed in `SHARED_SCHEMAS`. The export names it under
  `x-shared-definitions`, and the generator compiles it separately, because turning on json2ts's
  `unreachableDefinitions` adds a note to every type. The `204` delete registers `NoContent` (`null`).
  `StorylineJobResponse` became the shared `JobSubmissionResponse`, which the ingestion, extraction and backfill routes
  reuse.

## 3. Bugs the contract surfaced

Each fix started with a failing test.

| Bug | Symptom | Fix |
| --- | --- | --- |
| F7 | Entity page showed blank related-entity names and type badges | Relationships endpoint joins names, types and the entry date (W13) |
| F16 | Three job types showed a raw type string and a grey badge | `JobType` covers every created type, with labels (W13) |
| F19 | Entity page crashed on a mention whose entry was gone | `entry_date` nullable, shown as "Unknown date" (W13) |
| F18 | Calendar heatmap `from`/`to` are null without a range | Typed nullable (W14) |
| F17 | Settings response had an undeclared `search` block | Declared (W15) |
| F20 | `/api/auth/me` sent empty `created_at`/`updated_at` | The route loads the `User` row (W15) |
| Admin overview | Crashed when the server reported an ingestion-stats error | Handles the error body the server sends (W15) |
| API keys page | Read `prefix`, which the server never sends | Reads `key_prefix` (W15) |
| Divergence chips | Quadrants with no days showed a blank count | Show 0 (W16) |
| Quarantined tab | Mentions and Last seen columns were blank, so sorting by them misbehaved | `/api/entities/quarantined` returns list rows with counts (W17) |
| Quarantine routes | Answered 200 with a bare `{"id": N}` if the entity vanished mid-request | 404 (W17) |

W17 also corrected the merge-history type, which lacked the three quarantine snapshot fields the server sends.

## 4. Follow-ups

From the run's follow-up list:

- **F25** 20 Dependabot alerts on `main`, inherited from the old repos.
- **F26** The docs server may still serve old-layout chunks of the server docs. Reindex if so.
- **F27** `/api/health` needs auth, so the runbook's unauthenticated health check can't run.
- **F28** Some `webapp/src/api/*.ts` files still hand-write response types that duplicate generated ones (entities,
  jobs, entries, settings, admin, preferences, and inline types in `AdminDashboard.vue` and `LoginView.vue`).
- **F29** The MCP relationships tool and the mentions route still look up names one row at a time.
- **F30** W14 leftovers: two `dict[str, Any]` serializers, a dead dashboard fallback, an inline storyline delete type.
- **F31** API key expiry is dropped: the webapp sends `expires_at`, the server reads `expires_days`. A request body, so
  the contract can't see it.
- **F32** `/api/admin/users` sends SQLite 0/1 flags, and the API keys page lists revoked keys with a Revoke button.
- **F33** Fitness sync panel has no colour for the `normalize_drift` status.

Found in W17:

- `POST /api/conversations` stores the client's `citations` without validating them. A malformed citation would come
  back in later 2xx bodies and break the contract.
