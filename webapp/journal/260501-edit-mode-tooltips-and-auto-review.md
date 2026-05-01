# 2026-05-01 — Edit-mode auto-review + tokens / entity tooltips

Three small UX wins on `EntryDetailView.vue`.

## 1. Auto-enable Review when entering Edit mode while doubts exist

When a user clicks **Edit** on an entry that still has uncertain spans
(`uncertain_spans.length > 0`), the **Review** toggle now flips on
automatically. Previously it stayed off and the user had to click into it
themselves — but reviewing doubts is the priority job in edit mode, so
the click was wasted.

Implementation: a `watch(viewMode, ...)` that flips `showReview` to true
on every transition to `'edit'` while spans remain. Read-mode is
unchanged — entries still open in Read by default per `/entries/N`, and
Review starts off there. Going edit → read → edit re-arms the toggle
even if the user manually switched it off mid-session.

## 2. Tooltip on the `tokens` overlay button

Hovering the **tokens** overlay radio now explains exactly what's being
shown:

> Show exact tokens from tiktoken's cl100k_base encoding — the same
> tokenizer that text-embedding-3-large uses to chunk and index your
> entries. A token is usually a whole word, sometimes part of a word.

The user asked whether the overlay is exact tokenization or guesswork.
It's exact — the backend calls `tiktoken.get_encoding("cl100k_base")` at
module load and runs `.encode()` per request — so the tooltip says so
plainly. Same encoding the chunker uses (`services/chunking.py:38`), so
what you see is what gets embedded.

Also added matching tooltips to the **off** and **chunks** buttons for
consistency.

## 3. Entity-chip tooltip names the category and the click action

Hovering an entity chip used to say:

> Highlight 'Alice' in the text

Now it says:

> Person. Click to highlight 'Alice' in the text.

The category prefix makes the colour-coding self-documenting: violet
chips are people, sky-blue are places, emerald is activities, yellow is
organizations, rose-pink is topics, grey is other. No legend needed —
hover any chip to learn the rule.

## Implementation notes

- All three changes live entirely in `src/views/EntryDetailView.vue`.
  No new components, no store changes, no API changes.
- Tooltips use the native HTML `title` attribute, matching the
  pre-existing pattern on this page (no PrimeVue / v-tooltip in the
  webapp today).
- Lookup tables (`OVERLAY_MODE_TOOLTIPS`, `ENTITY_CATEGORY_LABELS`) are
  used instead of `switch` statements so each function has a single
  branch — keeps the file's branch coverage above the 85% threshold
  that the pre-push hook enforces.

## Tests

- `EntryDetailView.test.ts` — new tests for auto-enable on edit-mode
  entry (with and without doubts), re-enable on edit→read→edit, and for
  both new tooltips. Existing test "opens in read mode even when entry
  has doubts" is preserved (entries still open in Read by default).
  Existing test "does not auto-enable review when entry has no doubts"
  is preserved verbatim — when there are no doubts, edit mode no longer
  flips the toggle.
