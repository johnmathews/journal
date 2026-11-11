# Multi-User Authentication Frontend

**Date:** 2026-04-14

## Summary

Added authentication UI, admin panel, and API key management to the journal webapp.
Cookie-based sessions replace the old bearer token approach.

## Changes

- Pinia auth store with initialize/login/logout/register actions
- Vue Router guards (public/protected/admin routes)
- API client switched from bearer token to `credentials: 'include'`
- Login, register, forgot password, reset password, verify email views
- API keys management page (generate, list, revoke)
- Admin dashboard (user list with stats, enable/disable)
- Header: admin link + sign out button
- Sidebar: API keys + admin nav items (conditional)
- App.vue: conditional layout (public vs authenticated)
- Removed `window.__JOURNAL_CONFIG__` token injection

## Design

Auth pages use the Mosaic card style (rounded-2xl, bg-white dark:bg-gray-800, shadow-sm)
with violet accent colors. Dark mode fully supported.
