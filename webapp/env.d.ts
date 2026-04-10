/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL: string
  // Bearer token for the journal-server REST and MCP endpoints. Injected
  // at build time via `VITE_JOURNAL_API_TOKEN=...` when running vite
  // build or vite dev. Must match JOURNAL_API_TOKEN in the server's .env.
  readonly VITE_JOURNAL_API_TOKEN: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
