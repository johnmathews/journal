# Architecture

## Overview

The journal-webapp is a Vue 3 single-page application that provides a web interface for the Journal Analysis Tool. It connects to the journal-server REST API to display, browse, and correct journal entries.

## Tech Stack

| Technology    | Purpose                          |
|---------------|----------------------------------|
| Vue 3.5+      | UI framework (Composition API)   |
| TypeScript    | Type safety                      |
| Vite          | Build tool and dev server         |
| PrimeVue 4.5  | UI component library (Aura theme)|
| Pinia         | State management                  |
| Vue Router 4  | Client-side routing               |
| Chart.js      | Charts (via PrimeVue Chart)       |
| Vitest        | Unit and component testing         |

## Layers

### Views (`src/views/`)
Page-level components, one per route. Each view composes layout, components, and store interactions.

- **EntryListView** — PrimeVue DataTable with server-side pagination, date formatting, row click navigation
- **EntryDetailView** — Side-by-side OCR review editor with Splitter, dirty tracking, save with re-processing

### Composables (`src/composables/`)
Reusable Composition API functions encapsulating reactive logic.

- **useEntryEditor** — Manages editor state: text syncing, dirty tracking, modification detection, reset

### Stores (`src/stores/`)
Pinia stores for server state management.

- **entries** — Entry list, current entry, pagination, loading/error states, CRUD actions

### API Layer (`src/api/`)
Typed fetch wrappers for the journal-server REST API.

- **client.ts** — Generic `apiFetch<T>` with error handling and `ApiRequestError` class
- **entries.ts** — Endpoint functions: `fetchEntries`, `fetchEntry`, `updateEntryText`, `fetchStats`

### Types (`src/types/`)
Shared TypeScript interfaces matching the REST API response schemas.

## Data Flow

```
User Action → View Component → Pinia Store Action → API Function → REST API
                                                                      ↓
                              View re-renders ← Store state updates ← Response
```

## Backend Integration

The webapp connects to journal-server's REST API:
- **Development:** Vite proxies `/api/*` requests to `localhost:8400`
- **Production:** nginx proxies `/api/*` to the journal-server container

The webapp never connects to the MCP protocol. MCP is for LLM clients (Claude, Nanoclaw); the webapp uses the REST API.
