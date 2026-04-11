# 260411 — Entry-entities contract mismatch (the *actual* blank-page cause)

## What the user reported

> "it still doesn't work. [...] in prod in the console i get the error
> 'TypeError: can't access property length, $.value is undefined'"

Firefox's variant of the same thing I later reproduced in Chromium as
`TypeError: Cannot read properties of undefined (reading 'length')`.

## The real failure mode

Not any of the three I fixed in the first pass. This was a straight-up
contract mismatch between journal-server and journal-webapp that had
been latent since the entity-tracking feature shipped.

**Server — `GET /api/entries/{id}/entities`:**

```python
return JSONResponse(
    {"entry_id": entry_id, "items": items, "total": len(items)}
)
```

Follows the `items` / `total` convention used by every other list
endpoint in the API (`/api/entries`, `/api/entities`, search).

**Webapp — `src/types/entity.ts`:**

```ts
export interface EntryEntitiesResponse {
  entry_id: number
  entities: EntryEntityRef[]   // ← wrong key
}
```

**Webapp — `src/views/EntryDetailView.vue`:**

```ts
const resp = await fetchEntryEntities(entryId)
entryEntities.value = resp.entities   // ← resp.entities is undefined
```

`ref<EntryEntityRef[]>([])` becomes `undefined` at runtime. The next
render cycle hits the template:

```vue
<div v-if="entryEntities.length" ...>
```

Vue compiles that to `entryEntities.value.length`, which is
`undefined.length`, which throws, which bails Vue out of the entire
`<template v-else-if="store.currentEntry">` branch, which leaves
`<main>` rendered as a literal `<div><!----></div>` — the blank page
the user was staring at.

This happened on **every** entry detail load, regardless of whether
any entities had been extracted. The server returns `{items: []}`
even for empty sets, so `resp.entities` was always `undefined`.
Nuking the database would not have helped.

## Why the earlier "fix" commit missed it

My previous regression-tests-and-defensive-fix commit
(`1e23c17`) patched three real failure modes (missing
`word_count`, null text fields, the missing `v-else` fallback) — but
I verified them against a mock that hand-constructed
`{entry_id, entities: []}` for `fetchEntryEntities`, **matching the
webapp's wrong expectation**. The test mock and the webapp shared
the same fiction and the real server shape never got exercised.

Classic hiding-in-plain-sight: my investigation reproduced three
blank-page failure modes by fuzzing the response, but I fuzzed the
wrong endpoint. The entries endpoint was clean; the *entities*
endpoint was lying to me via the mock.

## Fix

Single commit on the webapp side, because the server convention is
the one every other endpoint in the API uses — it'd be churn to
change that and break clients that are already aligned.

- `src/types/entity.ts`
  - `EntryEntitiesResponse` now declares `items: EntitySummary[]`
    and `total: number`, matching the real shape.
  - `EntryEntityRef` is now a type alias for `EntitySummary`, which
    was always what the server was returning via `_entity_summary`
    — there's no separate chip-specific type needed, and the old
    one had `entity_id` where the server returns `id` (so the
    `RouterLink` target on chips was always broken too, it just
    never rendered because `entryEntities` crashed first).
- `src/views/EntryDetailView.vue`
  - `loadEntryEntities` reads `resp.items ?? []`. The `?? []`
    belt-and-braces guards against any future server shape drift:
    even if `items` goes missing, `entryEntities` stays an array.
  - `v-if="entryEntities?.length"` (was `entryEntities.length`).
    Defence in depth — a transiently-non-array value cannot throw
    during render.
  - Chip template keyed off `chip.id` (was `chip.entity_id`), which
    is what the server has always returned.
- `src/views/__tests__/EntryDetailView.test.ts`
  - Module-level `fetchEntryEntities` mock now returns the real
    `{entry_id, items, total}` shape. This is the shared lying mock
    that caused the original fix to miss the bug.
  - `+3` regression tests in the `blank-page regressions` suite:
    - pins the real `{items, total}` response shape;
    - covers a degenerate payload with `items` missing entirely;
    - asserts the rendered chip strip is keyed off `id` (not
      `entity_id`), with testids `entry-entity-chip-<id>`, so
      future refactors can't silently drop back to the old wrong
      field.
  - Router stub for `entity-detail` added, because the chip
    RouterLinks resolve synchronously at setup and need a target.

Total: 294 → 297 tests passing.

## How I found it this time

Reproduced in Playwright by serving the real `dist/` via
`vite preview` and pointing `/api` at a Python mock that returned
the **exact** response shape the production server emits. Clicking
an entry row crashed the detail view with the matching error in
the browser console (blank `<main>`, identical to the user's
symptom). Patching `resp.entities → resp.items ?? []` + the
template defensive check + the template `chip.id` rename and
rebuilding produced a fully-rendered detail view on the same mock,
zero console errors. Screenshots:

- `verify-5-before-entities-fix.png` — blank `<main>`, before fix
- `verify-6-after-entities-fix.png` — fully rendered, after fix

## Lessons worth writing down

1. **Don't let the unit-test mock and the real server speak
   different languages.** The shared fiction masked this bug for
   weeks of the feature's life, and even survived a
   reproduction pass because I reached for the same bad mock
   twice. Going forward, test mocks for `/api/*` should be shaped
   from the server's actual `JSONResponse(...)` calls — ideally
   with a shared fixture, but at minimum a code comment pointing
   at the server file so a grep can catch drift.
2. **A "v-if with a literal property access" in a Vue template is
   a runtime-type assertion.** `v-if="foo.length"` trusts that
   `foo` is both non-null *and* array-shaped — and Vue's compiled
   output doesn't give you the optional-chaining you wrote. Use
   `?.length` explicitly whenever the source is user data /
   network data.
3. **Keep bespoke DTO types for a single consumer site to a
   minimum.** `EntryEntityRef` existed only to rename `id` to
   `entity_id` for no reason I can reconstruct, and the rename
   both broke routing and desynced from the server. Reusing the
   existing `EntitySummary` type would have surfaced the mismatch
   the first time anyone opened `_entity_summary` alongside the
   webapp usage.
