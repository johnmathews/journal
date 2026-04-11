// Runtime configuration stub.
//
// In production this file is OVERWRITTEN at container startup by
// `docker/40-journal-config.sh`, which injects the real bearer token
// from the JOURNAL_API_TOKEN environment variable. The stub exists so:
//   1. dev (vite) and prod builds don't 404 on /config.js, and
//   2. the file is a known path in dist/ that the entrypoint can clobber.
//
// In dev the empty object means src/api/client.ts falls through to
// import.meta.env.VITE_JOURNAL_API_TOKEN (read from .env.local), so
// the existing dev workflow is unchanged.
window.__JOURNAL_CONFIG__ = {}
