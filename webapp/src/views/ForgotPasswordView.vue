<script setup lang="ts">
import { ref } from 'vue'
import { apiFetch, ApiRequestError } from '@/api/client'

const email = ref('')
const loading = ref(false)
const error = ref<string | null>(null)
const success = ref(false)

async function handleSubmit() {
  loading.value = true
  error.value = null
  try {
    await apiFetch('/api/auth/forgot-password', {
      method: 'POST',
      body: JSON.stringify({ email: email.value }),
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
            Reset Password
          </h1>
          <p class="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Enter your email and we'll send you a reset link
          </p>
        </div>

        <!-- Success message -->
        <div
          v-if="success"
          class="rounded-lg bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-700/60 px-4 py-3 text-sm text-green-700 dark:text-green-400"
        >
          <p class="font-medium">Check your email</p>
          <p class="mt-1">
            If an account exists for {{ email }}, we've sent a password reset
            link.
          </p>
          <div class="mt-4">
            <RouterLink
              to="/login"
              class="text-sm font-medium text-violet-500 hover:text-violet-600 dark:hover:text-violet-400"
            >
              Back to sign in
            </RouterLink>
          </div>
        </div>

        <template v-else>
          <!-- Error message -->
          <div
            v-if="error"
            class="mb-4 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700/60 px-4 py-3 text-sm text-red-700 dark:text-red-400"
          >
            {{ error }}
          </div>

          <form @submit.prevent="handleSubmit">
            <div>
              <label
                for="forgot-email"
                class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
              >
                Email
              </label>
              <input
                id="forgot-email"
                v-model="email"
                type="email"
                class="form-input w-full"
                placeholder="you@example.com"
                required
                autocomplete="email"
                @focus="error = null"
              />
            </div>

            <div class="mt-6">
              <button
                type="submit"
                class="btn w-full bg-violet-500 hover:bg-violet-600 text-white disabled:opacity-50 disabled:cursor-not-allowed"
                :disabled="loading"
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
                {{ loading ? 'Sending...' : 'Send Reset Link' }}
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
