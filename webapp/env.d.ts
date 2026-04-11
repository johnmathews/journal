/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL: string
  // Bearer token fallback, inlined by Vite at build time. Primarily
  // used in dev (via .env.local) and unit tests (via vi.stubEnv). In
  // production the runtime value on `window.__JOURNAL_CONFIG__` takes
  // priority — see src/api/client.ts.
  readonly VITE_JOURNAL_API_TOKEN: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

// Runtime config written to /config.js by the container entrypoint at
// startup (see docker/40-journal-config.sh). Loaded before the app
// bundle so it's already on `window` when api/client.ts first runs.
interface JournalRuntimeConfig {
  apiToken?: string
}

interface Window {
  __JOURNAL_CONFIG__?: JournalRuntimeConfig
}
