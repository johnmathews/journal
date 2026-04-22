# Wake Lock During Recording & Voice Transcription Confidence

## Wake Lock

Added a `useWakeLock` composable that wraps the Screen Wake Lock API. When recording a
voice journal entry on mobile, the screen will no longer dim or lock — even for 5–10 minute
recordings. The lock is acquired when recording starts, released when it stops, and
automatically re-acquired if the browser releases it during a visibility change (tab switch).

The Screen Wake Lock API has been Baseline since May 2024 with ~94.6% global coverage. All
target browsers are supported: Chrome/Android, Safari/iOS 16.4+, Firefox 126+ on all
platforms. No fallback library needed.

## Transcription Confidence Scoring

The server-side change (sibling commit in journal-server) adds `include=["logprobs"]` to the
existing `gpt-4o-transcribe` API call. Each token gets a log-probability indicating Whisper's
certainty. Low-confidence tokens are converted into character-offset uncertain spans and stored
in the existing `entry_uncertain_spans` table — the same table OCR doubts use.

No webapp changes were needed for the Review UI to work with voice entries. The Review toggle,
yellow highlighting, Prev/Next navigation, and "All Verified" button are all source-type
agnostic — they just check `uncertain_spans.length`. The only webapp change was making three
hardcoded "OCR" labels dynamic: the panel header, Review toggle tooltip, and empty-state
banner now show "transcription" for voice/audio entries.

## Key decisions

- Threshold default of -0.5 (≈60% confidence) is configurable via
  `TRANSCRIPTION_CONFIDENCE_THRESHOLD` env var.
- Spans are expanded to word boundaries so the UI highlights whole words, not sub-word tokens.
- `whisper-1` gracefully returns empty spans (no logprob support).
- Discussed 4 mispronunciation handling options; chose Option 2 (confidence-gated flagging)
  because the existing Review UI eliminates the need for new components. LLM cleanup can be
  layered on later if the flagging alone isn't sufficient.
