# API contract

**Status:** active. **Last updated:** 2026-11-11. **Last verified:** 2026-11-11 (every command below run as written on
branch `eng-contract-batch5`). **Supersedes:** none.

> Purpose
>
> The API contract describes each REST response body once, in Python, and generates the webapp's TypeScript types from
> it. Tests fail when the server, the committed schema or the webapp types disagree. This document explains how the
> contract works, how to change a response or add a route, and what the contract does not check.

## 1. How it works

Each 2xx response body is a strict `TypedDict` in
[`server/src/journal/api/contract/schemas.py`](../server/src/journal/api/contract/schemas.py), registered in
`RESPONSE_SCHEMAS` under the route's `name=` from `@mcp.custom_route(...)`. Two generated files follow from it:

| File | Written by | Holds |
| --- | --- | --- |
| [`contract/api.schema.json`](../contract/api.schema.json) | `uv run journal contract export` (from `server/`) | One JSON Schema document. The root `JournalApi` maps each route name to its body. |
| [`webapp/src/types/generated/api.ts`](../webapp/src/types/generated/api.ts) | `npm run contract:gen` (from `webapp/`) | One TypeScript type per schema definition, named after its `TypedDict` |

Both generated files are committed. Never edit them by hand. The webapp's own type files (`webapp/src/types/*.ts`)
re-export the generated types under the names the code already uses, for example
`export type { JobSubmissionResponse as StorylineJobResponse } from './generated/api'`. Request bodies and client-side
types stay hand-written next to those re-exports.

`schemas.py` also exports `ErrorResponse` (`{error: string, message?: string}`), the body of a non-2xx JSON response.
It is listed in `SHARED_SCHEMAS`, because no route returns it with a 2xx status, and the export names it under the
root's `x-shared-definitions` so the webapp generator emits it too.

### 1.1 The four gates

1. **Export drift test.** [`server/tests/test_contract_export.py`](../server/tests/test_contract_export.py) fails when a
   fresh export differs from the committed `contract/api.schema.json`. A `TypedDict` edit without a re-export fails
   here. Docstrings are exported as descriptions, so a docstring edit needs a re-export too.
2. **Runtime check in every API test.** Every test client is a `ContractTestClient`
   ([`server/tests/contract_check.py`](../server/tests/contract_check.py)). It validates each 2xx JSON body of a
   registered route against its `TypedDict` in Pydantic strict mode, and fails the test at the request call site with
   the route name and the Pydantic error. A test fails if any test module uses a bare `TestClient`.
3. **Route coverage.** [`server/tests/test_contract_coverage.py`](../server/tests/test_contract_coverage.py) reads every
   `custom_route` name from the real app and fails if one is not registered.
   [`server/tests/contract_allowlist.txt`](../server/tests/contract_allowlist.txt) is empty with `ceiling: 0`, so a new
   route can't be parked there.
4. **`contract:check`.** `npm run contract:check` regenerates the TypeScript in memory and fails when
   `webapp/src/types/generated/api.ts` differs. The webapp CI workflow runs it before the build.

Gates 1 to 3 are server tests, so they run inside the server unit-test run. The tracked pre-push hook
(`.githooks/pre-push`) runs that suite when a push touches `server/` or `contract/`, and
gate 4 (with lint, tests and the build) when it touches `webapp/` or `contract/`. CI runs the same checks: `server.yml`
and `webapp.yml` both trigger on `contract/**`.

## 2. Change a response

1. Edit the `TypedDict` in `server/src/journal/api/contract/schemas.py`, and the route if the body itself changes. If
   the change fixes a bug, write the failing API test first.
2. From the repo root, export the schema, regenerate the webapp types and check them:

   ```bash
   (cd server && uv run journal contract export)
   (cd webapp && npm run contract:gen)
   (cd webapp && npm run contract:check)
   ```

   Expected output, in order (the path is your checkout's):

   ```console
   Wrote API contract schema to <repo>/contract/api.schema.json
   contract:gen: wrote src/types/generated/api.ts.
   contract:check: src/types/generated/api.ts matches contract/api.schema.json.
   ```

3. Fix what `vue-tsc` now reports (`npm run build` in `webapp/`). A renamed or retyped field shows up in every view,
   store and test mock that reads it. Type test mocks with `satisfies` so they keep matching the server.
4. Commit `schemas.py`, `contract/api.schema.json` and `webapp/src/types/generated/api.ts` together.

## 3. Add a route

1. Give the route a unique `name=` in `@mcp.custom_route(...)`.
2. Add a `TypedDict` for its 2xx body and register it in `RESPONSE_SCHEMAS`. A route that answers `204 No Content`
   registers `NoContent`.
3. Export and regenerate as in §2.
4. Write an API test that reaches the 2xx response. The runtime check only validates bodies that a test produces.
5. Re-export the new type from the matching `webapp/src/types/*.ts` file.

Run the coverage test once the route is registered:

```bash
(cd server && uv run pytest tests/test_contract_coverage.py -q)
```

It passes when every route is registered. An unregistered route named `api_example` fails it with:

```console
E       AssertionError: Routes with no response contract: ['api_example']. Add a TypedDict for each to journal/api/contract/schemas.py, register it in RESPONSE_SCHEMAS and run `uv run journal contract export`. (tests/contract_allowlist.txt may only shrink.)
```

## 4. Conventions

- **Strict, closed shapes.** Every `TypedDict`, nested ones included, carries `@with_config(CONTRACT_CONFIG)`
  (`extra="forbid"`), so an unknown key fails the runtime check. A test checks that every object definition exports
  `additionalProperties: false`.
- **Strict types.** The runtime check validates in strict mode. An `int` field rejects a float, while a `float` field
  accepts an int, so type a value `float` whenever any code path can make it fractional (an SQL `AVG`, for example). A
  `bool` field rejects SQLite's `0`/`1`: convert with `bool(...)`, or type the field `SqliteBool` if the route sends
  the integer.
- **Optional keys use `NotRequired`.** A key that is sometimes absent is `NotRequired[...]`. A key that is always present
  but may be null is `X | None`.
- **No `from __future__ import annotations` in `schemas.py`.** Under it `typing` can't see `NotRequired` in string
  annotations, and optional keys export as required. `server/tests/test_contract_schemas.py` guards this.
- **Keyword keys use the functional form.** A body with a key that is a Python keyword (`from`) is declared as
  `X = TypedDict("X", {...})`, then `X.__doc__ = ...`, then `with_config(CONTRACT_CONFIG)(X)`. A private base class
  doesn't work, because every module-level `TypedDict` must appear in the exported `$defs`.
- **One name, several methods.** When one route name serves several methods, its contract is a `type` alias union of
  the bodies, for example `type EntryDetailResponse = EntryDetail | EntryUpdateResponse | EntryDeleteResponse`.
- **Names are TypeScript names.** The class name becomes the generated type name, so pick names that read well in the
  webapp and don't clash with an existing one.
- **Prettier is pinned.** `webapp/package.json` pins `prettier` to `~3.8.1`, and the generator formats with that
  version. A Prettier upgrade is its own change that reformats the code and regenerates `api.ts` together.

## 5. What the contract does not cover

- **Request bodies.** Only responses are described. A request mismatch passes every gate. Known example (fixed in
  #40): the API keys page sent `expires_at` while the server read only `expires_days`, so keys created with an expiry
  never expired. Pin a request shape with an endpoint test instead, as `TestApiKeys` in
  `server/tests/test_auth_api.py` does.
- **Values that type-check but are wrong.** The check validates types and keys only. `/api/auth/me` once returned empty
  strings for `created_at` and `updated_at`, which matched `str`. Only a test that asserts values catches this.
- **Non-2xx bodies.** Error bodies are not validated at runtime. `ErrorResponse` is exported for the webapp's use only.
- **The browser.** The webapp doesn't validate responses at runtime. `apiFetch<T>` trusts the server, so a deployed
  server that drifts from the committed contract goes unnoticed until something renders wrong.
- **Routes without a 2xx test.** A registered route whose 2xx path no test reaches is never validated.
- **Streamed and empty bodies.** The runtime check skips streamed responses and empty bodies such as `204`.
