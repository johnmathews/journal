<script setup lang="ts">
import { ref, computed } from 'vue'
import { connectGarmin, submitGarminMfa, disconnectGarmin } from '@/api/fitness'
import { ApiRequestError } from '@/api/client'
import { useFitnessStore } from '@/stores/fitness'
import FitnessBackfillForm from './FitnessBackfillForm.vue'
import type { FitnessSourceStatus } from '@/types/fitness'

const props = defineProps<{
  status: FitnessSourceStatus | null
}>()

const store = useFitnessStore()

// UI mode: idle | credentials | mfa | submitting | disconnecting
// `idle` covers both the never-connected and currently-connected
// resting states — the card's visible affordance switches on
// `connectionState` (derived from `props.status`).
type Mode = 'idle' | 'credentials' | 'mfa' | 'submitting' | 'disconnecting'
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

function errorMessage(e: unknown, fallback: string): string {
  if (e instanceof ApiRequestError) {
    // The server uses a `reason` field for machine-readable categories.
    // Surface a friendly message for the ones the user can act on; fall
    // back to the server message for anything else.
    const reason =
      e.body && typeof e.body.reason === 'string' ? e.body.reason : null
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
        <button
          v-if="connectionState === 'broken' && mode === 'idle'"
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
      <p class="text-xs text-gray-500 dark:text-gray-400">
        The password is sent once to authenticate with Garmin and is never
        stored on this server.
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
