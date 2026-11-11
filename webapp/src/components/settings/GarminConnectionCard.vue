<script setup lang="ts">
import { ref, computed } from 'vue'
import {
  connectGarmin,
  submitGarminMfa,
  disconnectGarmin,
  reconnectGarmin,
} from '@/api/fitness'
import { ApiRequestError } from '@/api/client'
import { useFitnessStore } from '@/stores/fitness'
import FitnessBackfillForm from './FitnessBackfillForm.vue'
import type { FitnessSourceStatus } from '@/types/fitness'

const props = defineProps<{
  status: FitnessSourceStatus | null
}>()

const store = useFitnessStore()

// UI mode: idle | credentials | mfa | submitting | reconnecting |
// disconnecting. `idle` covers both the never-connected and
// currently-connected resting states — the card's visible affordance
// switches on `connectionState` (derived from `props.status`).
// `reconnecting` is the in-flight state of the one-click
// reconnect-with-saved-credentials call; it is distinct from
// `submitting` so neither the credentials form nor the MFA form renders
// while the server logs in with the stored password.
type Mode =
  | 'idle'
  | 'credentials'
  | 'mfa'
  | 'submitting'
  | 'reconnecting'
  | 'disconnecting'
const mode = ref<Mode>('idle')

const username = ref('')
const password = ref('')
const mfaCode = ref('')
const pendingSession = ref<string | null>(null)
const error = ref<string | null>(null)

type ConnectionState = 'not-connected' | 'connected' | 'broken'

const connectionState = computed<ConnectionState>(() => {
  if (!props.status) return 'not-connected'
  if (props.status.auth_status === 'broken') return 'broken'
  return 'connected'
})

// True when the server holds a decryptable encrypted copy of the user's
// Garmin password (W5). Drives the saved-credentials line, the accurate
// password-storage copy, and the one-click reconnect affordance.
const credentialsSaved = computed<boolean>(
  () => props.status?.credentials_saved === true,
)

function openCredentialsForm(): void {
  mode.value = 'credentials'
  username.value = ''
  password.value = ''
  mfaCode.value = ''
  pendingSession.value = null
  error.value = null
}

function cancelForm(): void {
  mode.value = 'idle'
  username.value = ''
  password.value = ''
  mfaCode.value = ''
  pendingSession.value = null
  error.value = null
}

async function submitCredentials(): Promise<void> {
  if (!username.value || !password.value) {
    error.value = 'Email and password are required.'
    return
  }
  mode.value = 'submitting'
  error.value = null
  try {
    const resp = await connectGarmin({
      username: username.value,
      password: password.value,
    })
    if ('mfa_required' in resp) {
      pendingSession.value = resp.pending_session
      mode.value = 'mfa'
      // Drop the password from memory now that the upstream login has
      // captured it — we never need it again. The pending session is
      // what the MFA submit binds to.
      password.value = ''
    } else {
      // Success on the no-MFA branch — refresh the store and return to
      // idle. The parent panel re-reads status from the store.
      await store.loadSyncStatus()
      cancelForm()
    }
  } catch (e) {
    error.value = errorMessage(e, 'Connection failed.')
    mode.value = 'credentials'
  }
}

async function submitMfa(): Promise<void> {
  if (!pendingSession.value || !mfaCode.value) {
    error.value = 'Enter the 6-digit code from your authenticator.'
    return
  }
  mode.value = 'submitting'
  error.value = null
  try {
    await submitGarminMfa({
      pending_session: pendingSession.value,
      code: mfaCode.value,
    })
    await store.loadSyncStatus()
    cancelForm()
  } catch (e) {
    error.value = errorMessage(e, 'MFA verification failed.')
    mode.value = 'mfa'
  }
}

/**
 * One-click re-login using the credentials saved server-side — the user
 * never re-types their password. On an MFA challenge we drop straight
 * into the existing MFA form (same pending-session mechanics as
 * connect). When the server reports the saved credentials are gone or
 * undecryptable, fall back to the credentials form with the explanatory
 * error kept visible so a changed password isn't a dead end.
 */
async function reconnectWithSaved(): Promise<void> {
  mode.value = 'reconnecting'
  error.value = null
  try {
    const resp = await reconnectGarmin()
    if ('mfa_required' in resp) {
      pendingSession.value = resp.pending_session
      mfaCode.value = ''
      mode.value = 'mfa'
    } else {
      await store.loadSyncStatus()
      cancelForm()
    }
  } catch (e) {
    const message = errorMessage(e, 'Reconnect failed.')
    const reason =
      e instanceof ApiRequestError &&
      e.body &&
      typeof e.body.reason === 'string'
        ? e.body.reason
        : null
    if (
      reason === 'no_saved_credentials' ||
      reason === 'credentials_unavailable'
    ) {
      // Saved credentials can't be used — degrade to manual entry,
      // preserving the explanation (openCredentialsForm clears error).
      openCredentialsForm()
      error.value = message
    } else {
      // Rate limits and transient failures: stay on the resting card so
      // the user can retry the one-click path later.
      mode.value = 'idle'
      error.value = message
    }
  }
}

async function onDisconnect(): Promise<void> {
  mode.value = 'disconnecting'
  error.value = null
  try {
    await disconnectGarmin()
    await store.loadSyncStatus()
  } catch (e) {
    error.value = errorMessage(e, 'Disconnect failed.')
  } finally {
    mode.value = 'idle'
  }
}

// Turn the server's `retry_after_seconds` into a human "about N minutes"
// clause (with a leading space so it slots into a sentence), or '' when the
// server didn't say how long to wait.
function waitHint(seconds: number | null): string {
  if (!seconds || seconds <= 0) return ''
  const minutes = Math.ceil(seconds / 60)
  return minutes <= 1 ? ' about a minute' : ` about ${minutes} minutes`
}

function errorMessage(e: unknown, fallback: string): string {
  if (e instanceof ApiRequestError) {
    // The server uses a `reason` field for machine-readable categories.
    // Surface a friendly message for the ones the user can act on; fall
    // back to the server message for anything else.
    const reason =
      e.body && typeof e.body.reason === 'string' ? e.body.reason : null
    const retryAfter =
      e.body && typeof e.body.retry_after_seconds === 'number'
        ? e.body.retry_after_seconds
        : null
    switch (reason) {
      case 'invalid_credentials':
        return 'Garmin rejected those credentials.'
      case 'invalid_mfa_code':
        return 'Garmin rejected that MFA code. Try again with a fresh code.'
      case 'expired_pending_session':
        return 'The pending session expired. Start over from Connect.'
      case 'post_mfa_profile_fetch_failed':
        return 'Garmin accepted the code but the follow-up profile fetch failed. Try Connect again.'
      case 'upstream_account_mismatch':
        return 'This Garmin account differs from the one currently connected. Disconnect first.'
      case 'no_saved_credentials':
        return 'No saved Garmin credentials on this server. Enter your credentials to reconnect.'
      case 'credentials_unavailable':
        return (
          'The saved Garmin credentials can no longer be decrypted (the ' +
          'server credential key changed). Enter your credentials to ' +
          'reconnect.'
        )
      case 'rate_limited':
      case 'upstream_rate_limited':
        // Garmin/Cloudflare blocked the server's IP. Each retry re-arms the
        // block, so the actionable guidance is to stop and wait — not to
        // re-check the password.
        return (
          'Garmin is rate-limiting login attempts from this server. Stop ' +
          `retrying and wait${waitHint(retryAfter)} — each attempt re-arms ` +
          'the block. If it persists, try again later from a different network.'
        )
      case 'local_cooldown':
        return (
          'Too many recent Garmin login attempts for that account. Wait' +
          `${waitHint(retryAfter)} before trying again.`
        )
      default:
        return e.message || fallback
    }
  }
  if (e instanceof Error) return e.message
  return fallback
}

function formatDate(iso: string | null): string {
  if (!iso) return '—'
  // Keep formatting cheap and locale-aware; not a hot path.
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}
</script>

<template>
  <div
    class="p-4 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700/60 rounded-xl shadow-xs"
    data-testid="garmin-connection-card"
  >
    <div class="flex items-start justify-between gap-4">
      <div class="flex-1 min-w-0">
        <p class="text-sm font-semibold text-gray-800 dark:text-gray-200">
          Garmin Connect
        </p>
        <p
          class="text-xs text-gray-600 dark:text-gray-300 mt-1"
          data-testid="garmin-status-line"
        >
          <template v-if="connectionState === 'not-connected'">
            Not connected.
          </template>
          <template v-else-if="connectionState === 'broken'">
            Connection broken since
            {{ formatDate(status?.auth_broken_since ?? null) }}.
          </template>
          <template v-else>
            Connected. Last sync:
            {{ formatDate(status?.last_success_at ?? null) }}.
          </template>
        </p>
        <p
          v-if="credentialsSaved"
          class="text-xs text-gray-500 dark:text-gray-400 mt-1"
          data-testid="garmin-creds-saved-line"
        >
          Credentials saved — re-authentication is usually automatic.
        </p>
      </div>
      <div class="flex flex-wrap items-center gap-2 shrink-0">
        <button
          v-if="connectionState === 'not-connected' && mode === 'idle'"
          type="button"
          class="btn-sm bg-violet-500 hover:bg-violet-600 text-white"
          data-testid="garmin-connect-btn"
          @click="openCredentialsForm"
        >
          Connect
        </button>
        <!--
          Broken auth, saved credentials: primary action is one-click
          reconnect — no password re-entry. The small link below keeps
          fresh-credential entry reachable (changed Garmin password).
        -->
        <button
          v-if="
            connectionState === 'broken' &&
            credentialsSaved &&
            (mode === 'idle' || mode === 'reconnecting')
          "
          type="button"
          class="btn-sm bg-violet-500 hover:bg-violet-600 text-white disabled:opacity-50"
          :disabled="mode === 'reconnecting'"
          data-testid="garmin-reconnect-saved-btn"
          @click="reconnectWithSaved"
        >
          {{
            mode === 'reconnecting'
              ? 'Reconnecting…'
              : 'Reconnect with saved credentials'
          }}
        </button>
        <button
          v-if="
            connectionState === 'broken' && credentialsSaved && mode === 'idle'
          "
          type="button"
          class="text-xs text-violet-600 dark:text-violet-400 underline hover:no-underline"
          data-testid="garmin-use-different-creds"
          @click="openCredentialsForm"
        >
          Use different credentials
        </button>
        <button
          v-if="
            connectionState === 'broken' && !credentialsSaved && mode === 'idle'
          "
          type="button"
          class="btn-sm bg-violet-500 hover:bg-violet-600 text-white"
          data-testid="garmin-reconnect-btn"
          @click="openCredentialsForm"
        >
          Reconnect
        </button>
        <button
          v-if="
            (connectionState === 'connected' || connectionState === 'broken') &&
            mode === 'idle'
          "
          type="button"
          class="btn-sm bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600"
          data-testid="garmin-disconnect-btn"
          @click="onDisconnect"
        >
          Disconnect
        </button>
      </div>
    </div>

    <!-- Credentials form -->
    <div
      v-if="
        mode === 'credentials' || (mode === 'submitting' && !pendingSession)
      "
      class="mt-4 space-y-2"
      data-testid="garmin-credentials-form"
    >
      <label class="flex flex-col text-xs text-gray-700 dark:text-gray-300">
        <span class="mb-1">Garmin Connect email</span>
        <input
          v-model="username"
          type="email"
          class="form-input text-sm py-1 px-2 w-72"
          autocomplete="username"
          data-testid="garmin-username-input"
        />
      </label>
      <label class="flex flex-col text-xs text-gray-700 dark:text-gray-300">
        <span class="mb-1">Password</span>
        <input
          v-model="password"
          type="password"
          class="form-input text-sm py-1 px-2 w-72"
          autocomplete="current-password"
          data-testid="garmin-password-input"
          @keyup.enter="submitCredentials"
        />
      </label>
      <p
        class="text-xs text-gray-500 dark:text-gray-400"
        data-testid="garmin-password-storage-note"
      >
        Your password is sent to Garmin to mint a session token. If this server
        has credential storage enabled, it is also saved encrypted so future
        re-authentication can happen automatically.
      </p>
      <div class="flex gap-2">
        <button
          type="button"
          class="btn-sm bg-violet-500 hover:bg-violet-600 text-white disabled:opacity-50"
          :disabled="mode === 'submitting'"
          data-testid="garmin-credentials-submit"
          @click="submitCredentials"
        >
          {{ mode === 'submitting' ? 'Connecting…' : 'Continue' }}
        </button>
        <button
          type="button"
          class="btn-sm bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600"
          :disabled="mode === 'submitting'"
          data-testid="garmin-credentials-cancel"
          @click="cancelForm"
        >
          Cancel
        </button>
      </div>
    </div>

    <!-- MFA prompt -->
    <div
      v-if="mode === 'mfa' || (mode === 'submitting' && pendingSession)"
      class="mt-4 space-y-2"
      data-testid="garmin-mfa-form"
    >
      <label class="flex flex-col text-xs text-gray-700 dark:text-gray-300">
        <span class="mb-1">Garmin MFA code</span>
        <input
          v-model="mfaCode"
          type="text"
          inputmode="numeric"
          maxlength="6"
          class="form-input text-sm py-1 px-2 w-32 tracking-widest"
          data-testid="garmin-mfa-input"
          @keyup.enter="submitMfa"
        />
      </label>
      <p class="text-xs text-gray-500 dark:text-gray-400">
        Enter the 6-digit code from your authenticator app.
      </p>
      <div class="flex gap-2">
        <button
          type="button"
          class="btn-sm bg-violet-500 hover:bg-violet-600 text-white disabled:opacity-50"
          :disabled="mode === 'submitting'"
          data-testid="garmin-mfa-submit"
          @click="submitMfa"
        >
          {{ mode === 'submitting' ? 'Verifying…' : 'Verify' }}
        </button>
        <button
          type="button"
          class="btn-sm bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600"
          :disabled="mode === 'submitting'"
          data-testid="garmin-mfa-cancel"
          @click="cancelForm"
        >
          Cancel
        </button>
      </div>
    </div>

    <p
      v-if="error"
      class="mt-3 text-xs text-rose-700 dark:text-rose-300"
      data-testid="garmin-error"
    >
      {{ error }}
    </p>

    <!-- Backfill (only when connected and not mid-flow). -->
    <FitnessBackfillForm
      v-if="connectionState === 'connected' && mode === 'idle'"
      source="garmin"
    />
  </div>
</template>
