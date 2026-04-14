<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import type { RegisterData } from '@/stores/auth'

const router = useRouter()
const authStore = useAuthStore()

const email = ref('')
const password = ref('')
const displayName = ref('')

async function handleRegister() {
  const data: RegisterData = {
    email: email.value,
    password: password.value,
    display_name: displayName.value,
  }
  try {
    await authStore.register(data)
    router.push({ name: 'dashboard' })
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
            Create Account
          </h1>
          <p class="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Register for Journal Insights
          </p>
        </div>

        <!-- Error message -->
        <div
          v-if="authStore.error"
          class="mb-4 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700/60 px-4 py-3 text-sm text-red-700 dark:text-red-400"
        >
          {{ authStore.error }}
        </div>

        <form @submit.prevent="handleRegister">
          <div class="space-y-4">
            <div>
              <label
                for="register-name"
                class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
              >
                Display Name
              </label>
              <input
                id="register-name"
                v-model="displayName"
                type="text"
                class="form-input w-full"
                placeholder="Your name"
                required
                autocomplete="name"
                @focus="authStore.clearError()"
              />
            </div>

            <div>
              <label
                for="register-email"
                class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
              >
                Email
              </label>
              <input
                id="register-email"
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
                for="register-password"
                class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
              >
                Password
              </label>
              <input
                id="register-password"
                v-model="password"
                type="password"
                class="form-input w-full"
                placeholder="Choose a strong password"
                required
                minlength="8"
                autocomplete="new-password"
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
              {{ authStore.loading ? 'Creating account...' : 'Create Account' }}
            </button>
          </div>
        </form>

        <div class="mt-5 text-center">
          <span class="text-sm text-gray-500 dark:text-gray-400"
            >Already have an account?</span
          >
          {{ ' ' }}
          <RouterLink
            to="/login"
            class="text-sm font-medium text-violet-500 hover:text-violet-600 dark:hover:text-violet-400"
          >
            Sign in
          </RouterLink>
        </div>
      </div>
    </div>
  </div>
</template>
