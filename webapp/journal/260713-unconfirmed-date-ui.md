# 2026-07-13 — Unconfirmed-date badge + confirm flow

UI half of the entry-date-integrity work (server spec:
`journal-server/docs/superpowers/specs/2026-07-13-entry-date-integrity-design.md`,
origin: two year-off handwritten entries polluting three storylines).

- `date_confirmed?: boolean` added to `EntrySummary` and `EntryDetail`.
  **Optional, not required** (deviation from the plan): keeps nine test
  factories untouched and — more importantly — old-server payloads
  (`undefined`) render badge-free, so deploy order can't paint a badge
  on every entry. The badge keys on `=== false`.
- `EntryListView`: yellow "Unconfirmed date" chip in the desktop date
  cell and the mobile card header.
- `EntryDetailView`: clickable "Unconfirmed date — click to fix" pill
  (styled like the "Modified" tag) that opens the existing date editor;
  `saveDate` remembers the prior unconfirmed state and toasts
  "Date confirmed — reprocessing queued." when the save released the
  entry. Errors surface via the existing `store.error` banner — the
  server 400 carries the allowed-range message.
- Test note: `useToast()` returns a fresh object per call around shared
  singleton functions, so `vi.spyOn(toast, 'success')` on a
  test-local object never observes the component's calls — the toast
  assertions mock the composable module with a `vi.hoisted` spy
  instead.

No new endpoints or store actions — confirming is a side effect of the
normal PATCH date edit.
