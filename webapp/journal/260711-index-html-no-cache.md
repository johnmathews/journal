# 1. Fix: index.html must not be cached (blank view after deploy)

**Date:** 2026-07-11 · **Branch:** `fix/index-html-no-cache`

## 1.1 Symptom

After deploying the configurable-columns change, the `/jobs` table rendered with no columns for a user already on the site. Not a code bug — the deployed bundle was new and self-consistent, no bad column preference was stored, and the component code was correct.

## 1.2 Root cause

`nginx.conf` cached `/assets/*` immutably (correct — content-hashed filenames) but served **`index.html` with no `Cache-Control` header**. Browsers apply heuristic caching to a document with no `Cache-Control`, so the browser kept a stale `index.html` from before the deploy. That stale entry point references old JS chunk hashes that the new image no longer contains → the route fails to load its code → blank/columnless view. This is the classic SPA-redeploy cache trap and it would recur on every deploy for any user whose `index.html` was still cached.

## 1.3 Fix

Add an exact-match location for `index.html` with `Cache-Control: no-cache`:

```nginx
location = /index.html {
    add_header Cache-Control "no-cache" always;
}
```

`no-cache` (revalidate-before-use, not `no-store`) lets the browser keep a copy but always revalidate via the existing `ETag` — a cheap `304` when unchanged, a fresh `200` after a deploy. The SPA fallback (`try_files … /index.html`) does an internal redirect that re-enters location matching, so this exact match applies to every client route, not just a literal `/index.html` request.

Validated: `nginx -t` parses the new block cleanly (the only `-t` error in a standalone container is the runtime DNS lookup of the `journal-server` upstream, which resolves on the compose network in production).

## 1.4 Note

Existing users with an already-cached `index.html` need one hard refresh (Cmd+Shift+R) to pick up the fix; after that, `no-cache` keeps them current automatically. The `/config.js` runtime-config file was already `no-store`; `/assets/*` stays immutable.
