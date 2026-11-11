# 260617 — Conversations: persisted multi-turn chat from a Search answer

Adds a full-page chat feature so a user can continue interrogating their journal after
getting a Search answer. A conversation is seeded from the answer already on screen (no
second LLM call). Each follow-up re-grounds server-side by re-retrieving journal passages
and passing the full thread to the multi-turn answerer.

## Key decisions

- **Dedicated full-page chat view** (`/conversations/:id`) rather than an inline panel in
  `SearchView`. Conversations are long-lived — they need their own URL for deep-linking
  and history.
- **Seed from the existing Search answer** via `POST /api/conversations`. The question and
  answer the user already has on screen become the first two turns; no second synthesis
  call is made.
- **Optimistic user turn with rollback on failure.** When `reply()` is called, the user
  message is appended to the thread immediately for snappy UX. If `POST
  /api/conversations/{id}/messages` fails, the optimistic turn is removed so the local
  thread stays consistent with the server (nothing is persisted on failure server-side
  either).
- **Replies re-ground server-side.** Each follow-up retrieves fresh journal passages using
  the combined `original_question + "\n" + follow_up` query, so new specifics pull the
  right entries without the client needing to manage retrieval state.
- **History lives at `/conversations`.** The list view shows summaries (title, relative
  time, message count) and a per-row Delete action.
- **✨ star removed** from the answer tile header. The tile already has a violet accent
  border and tint; the star was redundant visual noise.

## New files

- `src/types/conversation.ts` — `ConversationMessage`, `Conversation`,
  `ConversationSummary`, `ConversationListResponse`.
- `src/api/conversations.ts` — `createConversation`, `listConversations`,
  `getConversation`, `sendMessage`, `deleteConversation`.
- `src/stores/conversations.ts` — Pinia store: `summaries`, `conversation`, `messages`,
  `sending`, `error`, `listLoading`. Actions: `start`, `open`, `reply`, `loadList`,
  `remove`.
- `src/views/ConversationListView.vue` — History list with loading/empty/error states and
  delete.
- `src/views/ConversationView.vue` — Full-page chat: message thread, optimistic send,
  thinking placeholder, citation chips linking to `EntryDetailView`.
- `src/views/__tests__/ConversationListView.test.ts`
- `src/views/__tests__/ConversationView.test.ts`
- `src/stores/__tests__/conversations.test.ts`

## Modified files

- `src/router/index.ts` — Added `/conversations` and `/conversations/:id` routes.
- `src/components/layout/AppSidebar.vue` — Added "Conversations" nav item.
- `src/views/SearchView.vue` — Added "Continue this conversation →" button; removed `✨`
  from the answer tile header.
- `src/views/__tests__/SearchView.test.ts` — Two new cases: star is absent, CTA seeds and
  navigates.
- `docs/architecture.md` — Conversations note (views, store, API, routing).
