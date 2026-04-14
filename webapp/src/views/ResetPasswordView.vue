<script setup lang="ts">
import { ref, computed } from 'vue'
import { useRoute } from 'vue-router'
import { apiFetch, ApiRequestError } from '@/api/client'

const route = useRoute()
const token = computed(() => (route.query.token as string) || '')

const password = ref('')
const confirmPassword = ref('')
const loading = ref(false)
const error = ref<string | null>(null)
const success = ref(false)

const passwordsMatch = computed(() => password.value === confirmPassword.value)

async function handleSubmit() {
  if (!passwordsMatch.value) {
    error.value = 'Passwords do not match.'
    return
  }
  if (!token.value) {
    error.value = 'Invalid or missing reset token.'
    return
  }

  loading.value = true
  error.value = null
  try {
    await apiFetch('/api/auth/reset-password', {
      method: 'POST',
      body: JSON.stringify({
        token: token.value,
        password: password.value,
      }),
    })
    success.value = true
  } catch (e) {
    if (e instanceof ApiRequestError) {
      error.value = e.message
    } else {
      error.value = 'Something went wrong. Please try again.'
    }
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div
    class="min-h-[100dvh] flex items-center justify-center bg-gray-100 dark:bg-gray-900 px-4"
  >
    <div class="w-full max-w-md">
      <div class="rounded-2xl bg-white dark:bg-gray-800 shadow-sm p-6 sm:p-8">
        <div class="mb-6 text-center">
          <h1 class="text-2xl font-bold text-gray-800 dark:text-gray-100">
            Set New Password
          </h1>
          <p class="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Choose a new password for your account
          </p>
        </div>

        <!-- Success message -->
        <div
          v-if="success"
          class="rounded-lg bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-700/60 px-4 py-3 text-sm text-green-700 dark:text-green-400"
        >
          <p class="font-medium">Password updated</p>
          <p class="mt-1">Your password has been reset successfully.</p>
          <div class="mt-4">
            <RouterLink
              to="/login"
              class="text-sm font-medium text-violet-500 hover:text-violet-600 dark:hover:text-violet-400"
            >
              Sign in with your new password
            </RouterLink>
          </div>
        </div>

        <template v-else>
          <!-- No token warning -->
          <div
            v-if="!token"
            class="mb-4 rounded-lg bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-700/60 px-4 py-3 text-sm text-yellow-700 dark:text-yellow-400"
          >
            No reset token found. Please use the link from your email.
          </div>

          <!-- Error message -->
          <div
            v-if="error"
            class="mb-4 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700/60 px-4 py-3 text-sm text-red-700 dark:text-red-400"
          >
            {{ error }}
          </div>

          <form @submit.prevent="handleSubmit">
            <div class="space-y-4">
              <div>
                <label
                  for="reset-password"
                  class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
                >
                  New Password
                </label>
                <input
                  id="reset-password"
                  v-model="password"
                  type="password"
                  class="form-input w-full"
                  placeholder="Enter new password"
                  required
                  minlength="8"
                  autocomplete="new-password"
                  @focus="error = null"
                />
              </div>

              <div>
                <label
                  for="reset-confirm"
                  class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
                >
                  Confirm Password
                </label>
                <input
                  id="reset-confirm"
                  v-model="confirmPassword"
                  type="password"
                  class="form-input w-full"
                  placeholder="Confirm new password"
                  required
                  minlength="8"
                  autocomplete="new-password"
                  @focus="error = null"
                />
                <p
                  v-if="confirmPassword && !passwordsMatch"
                  class="mt-1 text-sm text-red-500"
                >
                  Passwords do not match
                </p>
              </div>
            </div>

            <div class="mt-6">
              <button
                type="submit"
                class="btn w-full bg-violet-500 hover:bg-violet-600 text-white disabled:opacity-50 disabled:cursor-not-allowed"
                :disabled="loading || !token"
              >
                <svg
                  v-if="loading"
                  class="animate-spin -ml-1 mr-2 h-4 w-4 text-white"
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                >
                  <circle
                    class="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    stroke-width="4"
                  />
                  <path
                    class="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                  />
                </svg>
                {{ loading ? 'Resetting...' : 'Reset Password' }}
              </button>
            </div>
          </form>

          <div class="mt-5 text-center">
            <RouterLink
              to="/login"
              class="text-sm text-violet-500 hover:text-violet-600 dark:hover:text-violet-400"
            >
              Back to sign in
            </RouterLink>
          </div>
        </template>
      </div>
    </div>
  </div>
</template>
