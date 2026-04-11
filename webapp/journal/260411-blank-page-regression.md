# 260411 — Blank entry-detail page regression

## Report

> "in the webapp, (deployed) when i click on the entries page, and then
> click on an entry, all i see is a blank page! on firefox and also
> safari. this used to work."

Reproduced in Firefox and Safari on the deployed build. `/entries`
loaded fine; clicking any row navigated to `/entries/:id` and left the
`<main>` subtree completely empty. No error banner, no chrome, no
loading spinner — just the shell around nothing.

## Investigation

`npm run dev` against the real backend worked, as did `vite preview`
against `dist/` with a mocked `/api`. I couldn't repro from the happy
path. Instead I went looking for ways the rendered subtree could
collapse to nothing, because the symptom — an entirely blank `<main>`
— is what Vue emits (`<!---->`) when the currently-matched
`v-if`/`v-else-if` branch throws during render.

In Playwright + preview I patched `window.fetch` to return a few
deliberately-malformed `EntryDetail` shapes and watched the result:

1. **Missing `word_count` (or any number field the template calls
   `.toLocaleString()` on).** Template throws `TypeError: Cannot
   read properties of undefined (reading 'toLocaleString')` inside
   the `v-else-if="store.currentEntry"` branch, Vue bails out of the
   branch, and `<main>` becomes `<div><!----></div>`. **Blank page.**
2. **`raw_text` or `final_text` as `null`.** The reactive refs
   feeding `useDiffHighlight` propagate `null` into
   `diff-match-patch.diff_main`, which raises `Error: Null input.
   (diff_main)`. Same bail-out, same blank page.
3. **The initial tick before `onMounted` resolves `loadEntry`.**
   The store holds `(loading: false, error: null, currentEntry:
   null)` for exactly one render cycle. The existing template had a
   `v-if`/`v-else-if` chain for loading / error / loaded but no
   terminal `v-else`, so none of the three matched and the main area
   rendered as genuinely empty.

Any one of those is enough to produce the symptom. All three were
latent.

I cannot prove which of the three the user hit from dev — I don't
have a snapshot of the entry payload on the deployed VM — but the fix
is the same in all three cases: stop letting malformed inputs escape
into code that assumes its arguments are well-formed.

## Fix

Single webapp commit, no server changes:

- `src/views/EntryDetailView.vue`
  - New unconditional `v-else` "Loading entry…" branch so the
    template always has at least one matching branch.
  - Meta chips (`source_type.toUpperCase()`,
    `word_count.toLocaleString()`, `chunk_count`, `page_count`) now
    use `??` fallbacks so a missing field degrades to `"—"` / `"0
    words"` / `"0 chunks"` / `"0 pages"` instead of crashing the
    branch.
  - `originalText` watch coerces `raw_text` to `''` so the diff
    composable never sees `null`.
- `src/composables/useEntryEditor.ts` — coerces `final_text` to
  `''` on sync, reset, and the `isDirty` / `isModified`
  comparisons. Keeps `editedText: Ref<string>` actually a string.
- `src/composables/useDiffHighlight.ts` — `diffToSegments` coerces
  both inputs via `?? ''` before handing them to `diff_main`. The
  reactive wrapper does the same against `original.value` and
  `corrected.value` so a transiently-null ref can't throw
  mid-render. Comments in both places point back at this regression.

## Tests

+6 regression tests, all nailing a specific failure mode rather than
the generic "view renders ok" assertion that already existed:

- `src/views/__tests__/EntryDetailView.test.ts`
  - `renders the detail chrome even when word_count is missing from
    the payload` — guards the `.toLocaleString()` crash.
  - `renders the detail chrome even when raw_text and final_text
    are null` — guards the diff_main crash.
  - `shows a loading indicator instead of a blank main when the
    store is in its initial state` — stalls the fetch promise with
    a manual `resolveFetch` handle and asserts the `v-else` fallback
    is on screen.
- `src/composables/__tests__/useDiffHighlight.test.ts`
  - `treats null inputs as empty strings instead of throwing`
  - `treats undefined inputs as empty strings instead of throwing`
  - `returns escaped empty strings when the source refs are null`

Full suite: 288 → 294 tests, all passing. Lint clean. `npm run
build` clean.

## Why the tests didn't catch it before

The existing `EntryDetailView` tests all used a single hand-rolled
`fetchEntry` mock that returned a fully-populated `EntryDetail`. The
happy path was the only path being tested — nothing was asserting
what the view does when the payload is *off-contract*. The three new
tests are explicitly about off-contract inputs, which is the class of
bug that produced the blank page.

## Open questions

I don't know the actual payload that triggered this in production —
maybe a pre-migration entry with `final_text NULL`, maybe a stale
build, maybe a genuinely missing field on a specific entry. The fix
is defensive enough that any of those now degrades to a readable
panel instead of a blank page, and the regression tests mean a
refactor can't silently reintroduce the crash class.

If we later get a reproducer from production logs it would be worth
teaching the mock API used in unit tests to return one of those
shapes on demand, so the test suite catches it without me having to
rebuild the Playwright harness every time.
