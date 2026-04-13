<script setup lang="ts">
import { useToast } from '@/composables/useToast'

const { toasts, dismiss } = useToast()
</script>

<template>
  <Teleport to="body">
    <div
      class="fixed bottom-4 right-4 z-[9999] flex flex-col gap-2 pointer-events-none"
      aria-live="polite"
    >
      <TransitionGroup
        enter-active-class="transition ease-out duration-300"
        enter-from-class="opacity-0 translate-y-2"
        enter-to-class="opacity-100 translate-y-0"
        leave-active-class="transition ease-in duration-200"
        leave-from-class="opacity-100 translate-y-0"
        leave-to-class="opacity-0 translate-y-2"
      >
        <div
          v-for="toast in toasts"
          :key="toast.id"
          class="pointer-events-auto flex items-center gap-2 max-w-sm px-4 py-3 rounded-lg shadow-lg text-sm font-medium"
          :class="{
            'bg-emerald-600 text-white': toast.type === 'success',
            'bg-red-600 text-white': toast.type === 'error',
            'bg-gray-800 text-white dark:bg-gray-200 dark:text-gray-900':
              toast.type === 'info',
          }"
          data-testid="toast"
        >
          <span
            v-if="toast.type === 'success'"
            class="text-base"
            aria-hidden="true"
            >&#10003;</span
          >
          <span
            v-else-if="toast.type === 'error'"
            class="text-base"
            aria-hidden="true"
            >&#10007;</span
          >
          <span class="flex-1">{{ toast.message }}</span>
          <button
            class="ml-2 opacity-70 hover:opacity-100"
            aria-label="Dismiss"
            @click="dismiss(toast.id)"
          >
            &#10005;
          </button>
        </div>
      </TransitionGroup>
    </div>
  </Teleport>
</template>
