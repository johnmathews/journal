<script setup lang="ts">
import { RouterView, useRoute } from 'vue-router'
import { computed, watch } from 'vue'
import DefaultLayout from '@/layouts/DefaultLayout.vue'
import { useAuthStore } from '@/stores/auth'
import { useAppearanceStore } from '@/stores/appearance'

const authStore = useAuthStore()
const appearanceStore = useAppearanceStore()
const route = useRoute()

// The accent colour follows the signed-in user: load theirs on sign-in, and go back to the
// default on sign-out so the next person on this browser starts there.
watch(
  () => authStore.user?.id,
  (id, previous) => {
    if (id !== undefined) appearanceStore.load()
    else if (previous !== undefined) appearanceStore.reset()
  },
  { immediate: true },
)

const isPublicRoute = computed(() => route.meta.public === true)
</script>

<template>
  <!-- Loading spinner while auth state is unknown -->
  <div
    v-if="!authStore.initialized"
    class="flex items-center justify-center h-[100dvh] bg-gray-100 dark:bg-gray-900"
  >
    <div class="text-center">
      <svg
        class="animate-spin h-8 w-8 mx-auto text-accent-fg"
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
      <p class="mt-3 text-sm text-gray-600 dark:text-gray-300">Loading...</p>
    </div>
  </div>

  <!-- Public routes render without the sidebar/header shell -->
  <RouterView v-else-if="isPublicRoute" />

  <!-- Authenticated routes render inside the DefaultLayout -->
  <DefaultLayout v-else>
    <RouterView />
  </DefaultLayout>
</template>
