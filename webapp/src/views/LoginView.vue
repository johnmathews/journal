<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import type { LoginCredentials } from '@/stores/auth'
import { apiFetch } from '@/api/client'

const router = useRouter()
const route = useRoute()
const authStore = useAuthStore()

const email = ref('')
const password = ref('')
const registrationEnabled = ref(false)
const sessionExpired = route.query.expired === '1'

interface AuthConfig {
  registration_enabled: boolean
}

onMounted(async () => {
  try {
    const config = await apiFetch<AuthConfig>('/api/auth/config')
    registrationEnabled.value = config.registration_enabled
  } catch {
    // If the config endpoint fails, default to hiding registration
  }
})

async function handleLogin() {
  const credentials: LoginCredentials = {
    email: email.value,
    password: password.value,
  }
  try {
    await authStore.login(credentials)
    const redirect = route.query.redirect as string | undefined
    router.push(redirect || { name: 'dashboard' })
  } catch {
    // Error is set in the store
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
            Sign In
          </h1>
          <p class="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Welcome back to Journal Insights
          </p>
        </div>

        <!-- Session expired warning -->
        <div
          v-if="sessionExpired"
          class="mb-4 rounded-lg bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-700/60 px-4 py-3 text-sm text-yellow-700 dark:text-yellow-400"
        >
          Your session has expired. Please sign in again.
        </div>

        <!-- Error message -->
        <div
          v-if="authStore.error"
          class="mb-4 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700/60 px-4 py-3 text-sm text-red-700 dark:text-red-400"
        >
          {{ authStore.error }}
        </div>

        <form @submit.prevent="handleLogin">
          <div class="space-y-4">
            <div>
              <label
                for="login-email"
                class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
              >
                Email
              </label>
              <input
                id="login-email"
                v-model="email"
                type="email"
                class="form-input w-full"
                placeholder="you@example.com"
                required
                autocomplete="email"
                @focus="authStore.clearError()"
              />
            </div>

            <div>
              <label
                for="login-password"
                class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
              >
                Password
              </label>
              <input
                id="login-password"
                v-model="password"
                type="password"
                class="form-input w-full"
                placeholder="Enter your password"
                required
                autocomplete="current-password"
                @focus="authStore.clearError()"
              />
            </div>
          </div>

          <div class="mt-6">
            <button
              type="submit"
              class="btn w-full bg-violet-500 hover:bg-violet-600 text-white disabled:opacity-50 disabled:cursor-not-allowed"
              :disabled="authStore.loading"
            >
              <svg
                v-if="authStore.loading"
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
              {{ authStore.loading ? 'Signing in...' : 'Sign In' }}
            </button>
          </div>
        </form>

        <div class="mt-5 text-center space-y-2">
          <RouterLink
            to="/forgot-password"
            class="text-sm text-violet-500 hover:text-violet-600 dark:hover:text-violet-400"
          >
            Forgot password?
          </RouterLink>

          <div v-if="registrationEnabled">
            <span class="text-sm text-gray-500 dark:text-gray-400"
              >Don't have an account?</span
            >
            {{ ' ' }}
            <RouterLink
              to="/register"
              class="text-sm font-medium text-violet-500 hover:text-violet-600 dark:hover:text-violet-400"
            >
              Register
            </RouterLink>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
