<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { useRoute } from 'vue-router'
import { apiFetch, ApiRequestError } from '@/api/client'
import { useAuthStore } from '@/stores/auth'

const route = useRoute()
const authStore = useAuthStore()
const token = computed(() => (route.query.token as string) || '')

const loading = ref(true)
const error = ref<string | null>(null)
const success = ref(false)

onMounted(async () => {
  if (!token.value) {
    error.value =
      'No verification token found. Please check the link from your email.'
    loading.value = false
    return
  }

  try {
    await apiFetch(`/api/auth/verify-email?token=${encodeURIComponent(token.value)}`)
    // Refresh auth state so email_verified is true in the store
    authStore.$reset()
    await authStore.initialize()
    success.value = true
  } catch (e) {
    if (e instanceof ApiRequestError) {
      error.value = e.message
    } else {
      error.value = 'Email verification failed. The link may have expired.'
    }
  } finally {
    loading.value = false
  }
})
</script>

<template>
  <div
    class="min-h-[100dvh] flex items-center justify-center bg-gray-100 dark:bg-gray-900 px-4"
  >
    <div class="w-full max-w-md">
      <div
        class="rounded-2xl bg-white dark:bg-gray-800 shadow-sm p-6 sm:p-8 text-center"
      >
        <!-- Loading state -->
        <div v-if="loading">
          <svg
            class="animate-spin h-8 w-8 mx-auto text-violet-500"
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
          <p class="mt-4 text-sm text-gray-500 dark:text-gray-400">
            Verifying your email...
          </p>
        </div>

        <!-- Success state -->
        <div v-else-if="success">
          <div
            class="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-green-100 dark:bg-green-900/30"
          >
            <svg
              class="h-6 w-6 text-green-600 dark:text-green-400"
              fill="none"
              viewBox="0 0 24 24"
              stroke-width="2"
              stroke="currentColor"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                d="M4.5 12.75l6 6 9-13.5"
              />
            </svg>
          </div>
          <h1 class="mt-4 text-2xl font-bold text-gray-800 dark:text-gray-100">
            Email Verified
          </h1>
          <p class="mt-2 text-sm text-gray-500 dark:text-gray-400">
            Your email address has been verified successfully.
          </p>
          <div class="mt-6">
            <RouterLink
              to="/"
              class="btn bg-violet-500 hover:bg-violet-600 text-white"
            >
              Go to Dashboard
            </RouterLink>
          </div>
        </div>

        <!-- Error state -->
        <div v-else>
          <div
            class="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-red-100 dark:bg-red-900/30"
          >
            <svg
              class="h-6 w-6 text-red-600 dark:text-red-400"
              fill="none"
              viewBox="0 0 24 24"
              stroke-width="2"
              stroke="currentColor"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </div>
          <h1 class="mt-4 text-2xl font-bold text-gray-800 dark:text-gray-100">
            Verification Failed
          </h1>
          <p class="mt-2 text-sm text-red-600 dark:text-red-400">
            {{ error }}
          </p>
          <div class="mt-6">
            <RouterLink
              to="/login"
              class="btn bg-violet-500 hover:bg-violet-600 text-white"
            >
              Go to Sign In
            </RouterLink>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
