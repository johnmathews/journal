# Voice recording panel — 4th entry creation method

Added a "Record Voice" tab to the `/entries/new` page that lets you record audio via
the browser's microphone and submit it for transcription.

## What changed

- **`VoiceRecordPanel.vue`** — new component using the MediaRecorder API. Supports
  multiple recordings per entry, playback, removal, and submit. Processing state
  mirrors `ImageUploadPanel` (progress bar, background job notification, auto-dismiss).
- **`CreateEntryView.vue`** — added 4th tab "Record Voice" with `VoiceRecordPanel`.
- **Types** — added `'ingest_audio'` to `JobType`, `IngestAudioResponse` to ingest types.
- **API client** (`api/entries.ts`) — `ingestAudio()` sends recordings as multipart
  form data. Derives file extension from blob MIME type to support Safari (mp4) and
  Firefox/Chrome (webm).
- **Store** (`stores/entries.ts`) — `uploadAudio()` action wraps the API call with
  creating/error state management.

## UX flow

1. Click "Start Recording" — microphone activates, timer counts up
2. Click "Stop Recording" — recording added to a list
3. Optionally play back any recording, remove, or add more
4. Click "Submit for Transcription" — all recordings uploaded as one job
5. Progress screen shows transcription status; auto-dismisses on completion
6. Entry appears in the list once the background job finishes

## Tests

- 12 component tests covering start/stop, recording list, playback button, removal,
  submit with job tracking, mic permission error, and recording count display.
- 3 store tests for `uploadAudio` (success, error, non-Error fallback).

## Code review fixes

- `acknowledge()` now calls `stopPlayback()` before revoking blob URLs.
- Added unmount guard (`isUnmounted` flag) to prevent blob URL leak when
  `MediaRecorder.onstop` fires after component unmount.
- `ingestAudio` derives file extension from blob MIME type instead of hardcoding `.webm`.
