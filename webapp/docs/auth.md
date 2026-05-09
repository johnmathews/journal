# Frontend Authentication

The webapp uses cookie-based sessions for authentication. The backend sets an httpOnly session
cookie on login; the browser sends it automatically on every request.

## Architecture

### Auth Store (`src/stores/auth.ts`)

Pinia store managing auth state:

- **State:** `user`, `initialized`, `loading`, `error`
- **Computed:** `isAuthenticated`, `isAdmin`, `displayName`, `emailVerified`
- **Actions:** `initialize()`, `login()`, `logout()`, `register()`, `clearError()`, `$reset()`

On app startup, `initialize()` calls `GET /api/auth/me`. If the session cookie is valid, the user
object is populated. If not, the user remains unauthenticated.

### Route Guards (`src/router/index.ts`)

Global `beforeEach` guard:

1. Waits for `authStore.initialize()` on first navigation
2. Public routes (`meta.public: true`) pass through
3. Unauthenticated users redirect to `/login?redirect=<original-path>`
4. Admin routes (`meta.requiresAdmin: true`) blocked for non-admin users

### API Client (`src/api/client.ts`)

- All requests include `credentials: 'include'` (sends cookie automatically)
- No bearer token or `Authorization` header needed for web requests
- Global 401 handler: clears auth state, redirects to `/login?expired=1`

There is no `src/api/auth.ts` module — auth-related endpoints are called via
`apiFetch()` directly from the views and the auth store:

- `src/stores/auth.ts` — `/api/auth/me` (GET / PATCH), `/api/auth/login`,
  `/api/auth/logout`, `/api/auth/register`
- `src/views/LoginView.vue` — `/api/auth/config`
- `src/views/ForgotPasswordView.vue` — `/api/auth/forgot-password`
- `src/views/ResetPasswordView.vue` — `/api/auth/reset-password`
- `src/views/ApiKeysView.vue` — `/api/auth/api-keys` (GET / POST / DELETE)

### Conditional Layout (`src/App.vue`)

- **Loading state:** Shows spinner while `authStore.initialized` is false
- **Public routes:** Rendered without sidebar/header (login, register, etc.)
- **Authenticated routes:** Rendered inside `DefaultLayout`

## Routes

### Public Routes (no auth required)

| Path | Component | Purpose |
|------|-----------|---------|
| `/login` | LoginView | Email + password login |
| `/register` | RegisterView | Self-service registration |
| `/forgot-password` | ForgotPasswordView | Request password reset |
| `/reset-password` | ResetPasswordView | Set new password from email link |
| `/verify-email` | VerifyEmailView | Verify email from link |

### Protected Routes (auth required)

All existing routes (dashboard, entries, search, entities, jobs, settings) plus:

| Path | Component | Purpose |
|------|-----------|---------|
| `/api-keys` | ApiKeysView | Manage personal API keys |

### Admin Routes (admin only)

Mounted under `AdminLayout` (renders the page header + a five-tab bar with an
embedded `<RouterView/>`). Gated by `meta: { requiresAdmin: true }` and the
router's `beforeEach` guard against `useAuthStore.isAdmin`.

| Path | Route name | Component | Purpose |
|------|------------|-----------|---------|
| `/admin` | `admin-overview` | AdminOverview | Health card, cost-per-1k-words estimates, quick links |
| `/admin/users` | `admin-users` | AdminDashboard | List users with stats; toggle `is_active` |
| `/admin/runtime` | `admin-runtime` | AdminRuntimeView | Runtime feature flags + processing-pipeline cards |
| `/admin/pricing` | `admin-pricing` | AdminPricingView | Per-model pricing rows that drive cost estimates |
| `/admin/server` | `admin-server` | AdminServerView | Live-reload buttons (OCR context / transcription context / mood dimensions) |

## Header Changes

- Admin link visible only to `authStore.isAdmin` users
- Sign out button
- User display name shown

## Sidebar Changes

- API Keys navigation item (all authenticated users)
- Admin navigation item (admin users only)
