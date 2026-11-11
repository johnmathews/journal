# 2026-04-28 — Responsive footer spacing on the New Entry view

## What

The four entry-creation panels (`VoiceRecordPanel`, `FileUploadPanel`, `ImageUploadPanel`,
`TextEntryPanel`) shared a `flex items-center justify-between` footer row containing summary
text on the left ("1 recording · 2:44 total", "2 pages · 3.0 KB", etc.) and a primary action
button on the right ("Submit for Transcription", "Upload & Process", etc.). On narrow phone
viewports (≤640px) the row had no responsive gap and the text squashed against the button
with zero breathing room.

Switched all four panels to a `flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4`
container with `w-full sm:w-auto` on the button. Below `sm` (640px), the row stacks vertically
with the button as a full-width tap target. At `sm` and above, the row is identical to the
prior horizontal layout.

Also applied the same pattern to the Text-mode header row of `FileUploadPanel` (badge +
filename + size + "Change file" link), which had the same cramping potential, plus the
"Import File" submit button at the bottom of that flow.

## Why

The user's screenshot showed the cramped state on a small phone in portrait — exactly the
case Tailwind's `sm:` breakpoint is designed for. Stacking on narrow screens turns the button
into a comfortable tap target and removes the squashed look in a way that's idiomatic for
modern web apps.

## Decisions

- **Stack, not just gap.** A simple `gap-2` would have stopped the squashing but left the
  button still small and unfriendly on a phone. Stacking + `w-full sm:w-auto` is what every
  major UI library does for this case.
- **`sm:` breakpoint = 640px.** Tailwind's default. Phones in portrait are below it; tablets
  in portrait and any landscape orientation are above it. Verified visually at 375 × 667
  (iPhone SE), 768 × 1024 (iPad portrait), 844 × 390 (phone landscape), and 1280 × 800
  (desktop). All look clean.

## Visual verification

Used Playwright with the Vue devtools-style component instance walker to inject fake state
into each panel and screenshot the footer at the breakpoints above. Captures:

- `vrp-375-with-recording-after.png` — Record Voice with one recording, narrow phone: stacked.
- `text-entry-375-scrolled-bottom.png` — Write Entry with text typed, narrow phone: stacked.
- `file-upload-375-bottom.png` — Upload Files with two images, narrow phone: stacked.
- `vrp-768-ipad.png` — iPad portrait: horizontal row.
- `vrp-844-landscape.png` — iPhone landscape: horizontal row.
- `vrp-1280-desktop.png` — desktop: horizontal row.

The original failing case (matches the user's screenshot exactly) and the regression checks
on wider viewports all look correct.

## Files

- `src/components/VoiceRecordPanel.vue`
- `src/components/FileUploadPanel.vue` (footer + text-mode header + import-file submit)
- `src/components/ImageUploadPanel.vue`
- `src/components/TextEntryPanel.vue`

## Tests

No logic changed — the unit-test suite (1160 tests) still passes unchanged. CSS-only changes
do not warrant new unit tests; the Playwright screenshots are the verification.
