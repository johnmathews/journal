# 2026-06-17 — Auto-answer questions + distinct answer tile

Removed the manual "Answer this question" prompt. Now **every** search auto-calls
`POST /api/search/answer`; the server classifies the query (cheap Haiku) and only
synthesizes an answer for questions, so there's no second click and keyword
searches cost nothing extra.

Webapp changes:
- `submit()` is now async: it awaits `runSearch`, then (on a successful, non-empty
  search) fires `runAnswer()` automatically. Sort changes and pagination call
  `runSearch` directly so they re-order/page **without** re-answering.
- `runSearch` now clears the prior answer only when the query text actually
  changes — paging/sorting the same query keeps the answer in place.
- Loading UX: the `?`/wh-word heuristic gates the "Thinking…" tile so it shows
  only for question-shaped queries (no flash on keyword searches); the server's
  classifier remains authoritative for whether an answer actually appears.
- The answer tile is now visually distinct from result cards — a thicker violet
  accent border (`border-2`), a violet tint, and an "✨ Answer" header — so it
  reads as the AI answer, not another match.
- `AnswerResponse` gained `is_question`.
