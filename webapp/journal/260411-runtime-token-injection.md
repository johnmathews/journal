# 2026-04-11 — Runtime bearer token injection for the webapp

## Context

Prod on the media VM was returning HTTP 502 from the webapp. Root cause
was a restart loop on `journal-server`: the new `JOURNAL_API_TOKEN` fail-closed
check (added in the 04-11 auth session) was tripping because the Ansible
compose template never had the variable, so the server crashed on boot
and nginx in `journal-webapp` got connection refused when proxying
`/api/*`.

Fixing the server was straightforward — add the env var to the VM's
`.env` and the compose template. But that exposed the webapp half of the
problem: the webapp's bearer token was being baked into the JS bundle at
`npm run build` time via `VITE_JOURNAL_API_TOKEN`, so the "fix" on the
server side would have produced a new 401 from the webapp, not success.

Two ways to give the webapp a live token:

1. **Build-time bake.** Pass `VITE_JOURNAL_API_TOKEN` as a Docker build arg
   in CI, store the value as a GitHub Actions secret, live with the fact
   that rotating the token means a CI rebuild and that the secret ends up
   in every `ghcr.io/johnmathews/journal-webapp:*` layer forever.
2. **Runtime injection.** Keep the image secret-free and have the container
   write a config file at startup from an env var.

Went with option 2. The webapp will always sit behind auth, but defence
in depth matters, and having the live token pulled out of a public
registry image by anyone who `docker pull`s it is a worse failure mode
than having to wire up an entrypoint script once.

## Design

- `public/config.js` — committed stub that sets
  `window.__JOURNAL_CONFIG__ = {}`. Vite copies it into `dist/` at build
  time. Silences the 404 in dev and gives the container entrypoint a
  known path to clobber in prod.
- `index.html` — loads `/config.js` via a **non-module** `<script>` tag
  BEFORE `src/main.ts`. This matters: module scripts are deferred, so
  if both were `type="module"` the bundle could start executing before
  `window.__JOURNAL_CONFIG__` was set. As a plain script, the runtime
  config is guaranteed to be on `window` before any app code runs.
- `src/api/client.ts` — `getApiToken()` now reads
  `window.__JOURNAL_CONFIG__?.apiToken` first, then falls back to
  `import.meta.env.VITE_JOURNAL_API_TOKEN`. The fallback keeps dev
  (via `.env.local`) and unit tests (via `vi.stubEnv`) working without
  any changes to their call sites. In prod the fallback is empty, so a
  deployment where the entrypoint never ran produces loud 401s instead
  of quietly using a stale baked-in value.
- `env.d.ts` — added a `Window` augmentation typing
  `window.__JOURNAL_CONFIG__?: { apiToken?: string }`.
- `docker/40-journal-config.sh` — the runtime injection script. Key
  decisions:
  - **Dropped in `/docker-entrypoint.d/` rather than replacing
    `ENTRYPOINT`.** The `nginx:alpine` base image's own entrypoint
    iterates `*.sh` files in that directory before exec'ing nginx, so
    piggybacking is zero-fuss and keeps all the base-image behaviour
    (log symlinks, envsubst for templates, etc.) intact.
  - **Fail-closed.** If `JOURNAL_API_TOKEN` is empty the script prints
    a loud message and exits non-zero. The container never starts
    nginx with a placeholder stub, mirroring how `journal-server`
    refuses to start without the token. Symmetry is the point — either
    both ends have the token and the stack works, or neither does and
    both containers visibly fail the same way.
  - **Character-class validation.** The token is written into config.js
    inside a double-quoted JS string via a heredoc. That's a narrow
    injection surface but not a theoretical one: a misconfigured env
    var containing `"; evil(); //` would be a direct XSS in every
    browser that loads the webapp. The script rejects anything outside
    `[A-Za-z0-9_-]` (the URL-safe base64 alphabet that
    `secrets.token_urlsafe` produces), so a mis-set env is a crash, not
    a silent compromise. The regex is deliberately narrower than "no
    quotes/backslashes/newlines" — it's easier to reason about a
    positive allowlist, and nothing legitimate produces tokens outside
    that set.
  - **Chmod 0644.** The script runs as root (the base image's
    entrypoint does), but nginx workers run as the `nginx` user. Without
    explicit world-read the workers would get EACCES and return 500 on
    `/config.js`.
- `Dockerfile` — copies the script into `/docker-entrypoint.d/` and
  chmods +x. No `ENTRYPOINT` or `CMD` changes.
- `nginx.conf` — new `location = /config.js` block with
  `Cache-Control: no-store`. Exact-match `location =` has higher
  precedence than prefix-match `location /` in nginx, so order doesn't
  strictly matter, but it's placed before the SPA fallback for
  readability. The `no-store` header is what makes rotation cheap: a
  new token takes effect on the next request, not whenever the browser
  feels like revalidating.
- `.env.example` + `docs/deployment.md` — documented. Added a new
  "Runtime token injection" section to deployment.md explaining the
  mechanism, the reasoning, and the (very explicit) threat model caveat
  that the token authenticates the client application, not the user.

## Tests

Existing 8 tests in `src/api/__tests__/client.test.ts` kept passing
unchanged — the new `getApiToken()` falls through to `import.meta.env`
when `window.__JOURNAL_CONFIG__` is undefined, and the `beforeEach`
explicitly `delete`s it to keep tests hermetic (happy-dom was already
clean but being explicit avoids test-order coupling if someone adds a
new runtime-path test later).

Two new tests for the runtime path:

- `prefers the runtime token on window.__JOURNAL_CONFIG__ over the
  build-time env` — sets both and asserts the runtime value wins.
- `falls back to the build-time env when the runtime stub is empty` —
  sets `window.__JOURNAL_CONFIG__ = {}` and asserts the env token is
  used. Exercises the dev path and the "entrypoint never ran" failure
  mode in the same test.

287/287 unit tests pass. `npm run lint`, `npm run build`, and
`vue-tsc --noEmit` all clean.

## What still needs to happen outside this repo

The code changes above are self-contained, but the stack on the media VM
needs two coordinated updates (neither of which I can do from the
project directory since the Ansible-managed compose lives in the
`home-server` repo):

1. **Add `JOURNAL_API_TOKEN` to the VM's `.env`** alongside the other
   secrets (`ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, etc.).
2. **Pass it into both services** in the journal stack compose
   template:
   ```yaml
   journal-webapp:
     environment:
       - JOURNAL_API_TOKEN=${JOURNAL_API_TOKEN}
   journal-server:
     environment:
       ...
       - JOURNAL_API_TOKEN=${JOURNAL_API_TOKEN}
   ```
   The **same** value for both — this is the whole point, they have to
   agree on the shared secret.
3. Also on the VM side: check `MCP_ALLOWED_HOSTS` includes whatever
   hostname the browser hits (`journal-insights.itsa-pizza.com` in the
   log I was debugging). If it only has `127.0.0.1,localhost`, the
   server's DNS-rebinding check will reject requests with a 421 *after*
   the token fix, swapping a 502 for a different kind of broken.

Once CI builds the new webapp image, `docker compose pull &&
docker compose up -d` on the VM should bring the whole stack green.

## Pairing

No server-side changes are required — `journal-server`'s bearer-token
middleware already validates any client that presents the correct
token. The matching change on the Ansible side is config-only, not
code, so there's no `journal-server` PR paired with this one.

## Wrap-up additions

Caught during `/done` that the repo-root `docker-compose.yml` (used for
local `docker compose up` testing) would now break on boot, because the
new entrypoint fails closed when `JOURNAL_API_TOKEN` is unset and the
local compose file never passed the var through. Added it to both
services with `${JOURNAL_API_TOKEN:?set JOURNAL_API_TOKEN in .env or
the shell environment}` so a misconfigured local env fails at `compose
up` time with a clear message rather than crashing inside the
container. Both services receive the SAME value — this is the point.

Coverage check on `src/api/client.ts` came back at 100% statements / 100%
branches / 100% functions / 100% lines. Full project at
96.19% / 90.11% / 96.12% / 97.21% over 287 tests. `shellcheck` on
`docker/40-journal-config.sh` clean. `npm run build` clean. `vue-tsc
--noEmit` clean. `npm run lint` clean.
