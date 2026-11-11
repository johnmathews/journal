# Entry Date Integrity (Webapp) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Surface quarantined entries (server field `date_confirmed: false`) with an "Unconfirmed date" badge in the entries list and a confirm-date affordance on the detail view.

**Architecture:** Pure presentation over the existing PATCH flow — the server confirms an entry as a side effect of a valid date edit, so the webapp only needs the new field on its types, a badge in two views, and a success toast. No new endpoints, no new store actions.

**Tech Stack:** Vue 3 + TypeScript, Pinia, Tailwind CSS 4, Vitest + Vue Test Utils.

**Spec:** `../journal-server` repo → `docs/superpowers/specs/2026-07-13-entry-date-integrity-design.md`. Server plan: same repo → `docs/superpowers/plans/2026-07-13-entry-date-integrity-server.md` (must be deployed first — the field must exist in API payloads).

## Global Constraints

- Coverage thresholds: statements/branches/functions/lines ≥ 85% (pre-push hook enforces).
- `date_confirmed` is REQUIRED (not optional) on both entry types — update every test factory.
- Badge styling copies the existing yellow status pill (`EntryDetailView.vue:847–853` "Modified" tag), not the violet unread badge.
- Run `npm run test:coverage` (not `test:unit`) before pushing.

---

### Task 1: Types + list badge

**Files:**
- Modify: `src/types/entry.ts` (`EntrySummary` :1–19, `EntryDetail` :35–64)
- Modify: `src/views/EntryListView.vue` (desktop date cell in the td loop :596–612; mobile card header :627–640)
- Test: `src/views/__tests__/EntryListView.test.ts` (extend `mockEntry()` factory :8–24 + new badge tests), plus every other factory that builds entries (`src/views/__tests__/EntryDetailView.spec.ts` `makeEntry()` :69–87, `src/stores/__tests__/entries.test.ts` fixtures)

**Interfaces:**
- Consumes: server payload field `date_confirmed: boolean` on both summary and detail serializations.
- Produces: `EntrySummary.date_confirmed: boolean`, `EntryDetail.date_confirmed: boolean`; `data-testid="unconfirmed-date-badge"` chip.

- [ ] **Step 1: Write the failing tests**

```ts
// src/views/__tests__/EntryListView.test.ts (append; mockEntry gains
// date_confirmed: true as its default)
it('shows an unconfirmed-date badge when date_confirmed is false', async () => {
  mockFetchEntries.mockResolvedValue({
    items: [mockEntry({ id: 1, date_confirmed: false })],
    total: 1,
  })
  const wrapper = await mountList()
  expect(wrapper.find('[data-testid="unconfirmed-date-badge"]').exists()).toBe(true)
})

it('shows no badge for confirmed entries', async () => {
  mockFetchEntries.mockResolvedValue({
    items: [mockEntry({ id: 1, date_confirmed: true })],
    total: 1,
  })
  const wrapper = await mountList()
  expect(wrapper.find('[data-testid="unconfirmed-date-badge"]').exists()).toBe(false)
})
```

- [ ] **Step 2: Run to verify failure**

Run: `npm run test:unit -- EntryListView`
Expected: FAIL — TypeScript error on the factory field first; after adding the type, the badge assertions fail.

- [ ] **Step 3: Implement**

`src/types/entry.ts` — add `date_confirmed: boolean` to BOTH interfaces, adjacent to `doubts_verified`.

`EntryListView.vue` desktop row — special-case the date column inside the existing td loop (:596–612): render the plain `cellValue` text, then a chip:

```html
<td v-for="col in visibleOrderedColumns" :key="col.key" ...>
  {{ cellValue(col, entry) }}
  <span
    v-if="col.key === 'entry_date' && !entry.date_confirmed"
    class="ml-2 inline-flex text-xs font-medium bg-yellow-100 text-yellow-700 dark:bg-yellow-500/20 dark:text-yellow-400 rounded-full px-2 py-0.5"
    data-testid="unconfirmed-date-badge"
  >
    Unconfirmed date
  </span>
</td>
```

Mobile card header (:627–640) — same chip after the date `<span>`, `v-if="!entry.date_confirmed"` (keep the single `data-testid`; the tests query presence, and desktop/mobile render from the same component so use `findAll(...).length > 0` if both branches mount).

Update ALL entry factories (`mockEntry`, `makeEntry`, store fixtures) with `date_confirmed: true` defaults.

- [ ] **Step 4: Run tests**

Run: `npm run test:unit`
Expected: PASS across the suite (factories updated everywhere).

- [ ] **Step 5: Commit**

```bash
git add src/types/entry.ts src/views/EntryListView.vue src/views/__tests__ src/stores/__tests__
git commit -m "feat(entries): unconfirmed-date badge in entries list"
```

---

### Task 2: Detail-view pill + confirm flow + docs

**Files:**
- Modify: `src/views/EntryDetailView.vue` (status pills :847–853; `saveDate()` :74–91)
- Modify: `docs/` (entries doc — add a short "Unconfirmed dates" section; check `docs/README.md`/index for the right file)
- Create: `journal/260713-unconfirmed-date-ui.md`
- Test: `src/views/__tests__/EntryDetailView.spec.ts` (append)

**Interfaces:**
- Consumes: `EntryDetail.date_confirmed` (Task 1); existing `store.updateDate(id, date)` (PATCH `entry_date` — the server confirms + queues reprocessing on success); `useToast()` singleton.
- Produces: `data-testid="unconfirmed-date-pill"`; success toast `"Date confirmed — reprocessing queued."` when a save transitions the entry from unconfirmed to confirmed.

- [ ] **Step 1: Write the failing tests**

```ts
// EntryDetailView.spec.ts (append; makeEntry gained date_confirmed in Task 1)
it('shows the unconfirmed-date pill and opens the date editor from it', async () => {
  const wrapper = await mountWithEntry(makeEntry({ date_confirmed: false }))
  const pill = wrapper.find('[data-testid="unconfirmed-date-pill"]')
  expect(pill.exists()).toBe(true)
  await pill.trigger('click')
  expect(wrapper.find('[data-testid="date-input"]').exists()).toBe(true) // reuse the editor's real testid/selector
})

it('toasts when saving a date confirms a quarantined entry', async () => {
  vi.mocked(updateEntryDate).mockResolvedValue(
    makeEntry({ entry_date: '2026-07-09', date_confirmed: true }),
  )
  const wrapper = await mountWithEntry(makeEntry({ date_confirmed: false }))
  // open editor, set value, save — follow the existing saveDate test steps
  // then:
  expect(toastSuccessSpy).toHaveBeenCalledWith('Date confirmed — reprocessing queued.')
})

it('does not show the pill for confirmed entries', async () => {
  const wrapper = await mountWithEntry(makeEntry({ date_confirmed: true }))
  expect(wrapper.find('[data-testid="unconfirmed-date-pill"]').exists()).toBe(false)
})
```

(For the toast spy: `useToast` is a module-level singleton — spy via `vi.mock('@/composables/useToast', ...)` or import the singleton and spy on `.success`, matching however the existing text-save toast test at the `'Saved. Background jobs running.'` call is asserted; if none exists, mock the composable module.)

- [ ] **Step 2: Run to verify failure**

Run: `npm run test:unit -- EntryDetailView` → FAIL (no pill, no toast).

- [ ] **Step 3: Implement**

Pill next to the "Modified" tag (:847–853) — clickable, opens the existing editor:

```html
<button
  v-if="store.currentEntry && !store.currentEntry.date_confirmed"
  type="button"
  class="inline-flex text-xs font-medium bg-yellow-100 text-yellow-700 dark:bg-yellow-500/20 dark:text-yellow-400 rounded-full px-2.5 py-0.5 hover:bg-yellow-200 dark:hover:bg-yellow-500/30"
  data-testid="unconfirmed-date-pill"
  @click="startEditDate"
>
  Unconfirmed date — click to fix
</button>
```

`saveDate()` — remember the prior state and toast on release:

```ts
async function saveDate() {
  if (!store.currentEntry || editedDate.value === store.currentEntry.entry_date) {
    editingDate.value = false
    return
  }
  const wasUnconfirmed = !store.currentEntry.date_confirmed
  savingDate.value = true
  try {
    await store.updateDate(store.currentEntry.id, editedDate.value)
    editingDate.value = false
    if (wasUnconfirmed && store.currentEntry?.date_confirmed) {
      toast.success('Date confirmed — reprocessing queued.')
    }
  } catch {
    // error shown via store.error (server 400 carries the allowed-range message)
  } finally {
    savingDate.value = false
  }
}
```

Docs: short section in the entries doc (what the badge means, that the server rejects dates before `MIN_ENTRY_DATE`, that confirming triggers reprocessing). Journal entry: incidents recap + link to the server-side spec.

- [ ] **Step 4: Full verification**

```bash
npm run test:coverage   # thresholds ≥85% must hold
npm run lint && npm run build
```

- [ ] **Step 5: Commit, push, watch CI**

```bash
git add -A src docs journal
git commit -m "feat(entries): unconfirmed-date pill + confirm-date flow on detail view"
git push
gh run watch --exit-status
```

---

## Self-review notes

- Spec coverage: webapp scope is exactly the badge + confirm flow; release mechanics live server-side (PATCH side effect), so no store/API changes beyond the type field.
- The list badge does not live-update after a confirm on the detail view — the list refetches on navigation (`fetchEntries` on mount), which is the existing behavior for `doubts_verified` too. Acceptable; noted here so it isn't re-litigated.
- Server must deploy before this ships or `date_confirmed` will be `undefined` (falsy) and every entry would show the badge — coordinate the deploy order (server first), same as the plan header says.
