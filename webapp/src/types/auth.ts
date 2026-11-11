// Auth types. The `/api/auth/*` response shapes are generated from the
// server's API contract (server/src/journal/api/contract/schemas.py);
// request bodies stay hand-written below.
//
// - Login, register, `GET`/`PATCH /api/auth/me` and the admin user update
//   all answer `AuthUserResponse` (`{ user: AuthUser }`).
// - `ApiKey` is never the secret: the full key appears once, in the
//   `ApiKeyCreatedResponse` from `POST /api/auth/api-keys`. Revoked keys
//   are listed with `revoked_at` set.
export type {
  ApiKey,
  ApiKeyCreatedResponse,
  ApiKeyListResponse,
  AuthConfigResponse,
  AuthUser,
  AuthUserResponse,
} from './generated/api'

/** Request body of `POST /api/auth/login`. */
export interface LoginCredentials {
  email: string
  password: string
}

/** Request body of `POST /api/auth/register`. */
export interface RegisterData {
  email: string
  password: string
  display_name: string
}
