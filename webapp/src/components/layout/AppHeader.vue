<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import ThemeToggle from './ThemeToggle.vue'
import AppNotifications from './AppNotifications.vue'
import { useAuthStore } from '@/stores/auth'

defineProps<{
  sidebarOpen: boolean
}>()

defineEmits<{
  'toggle-sidebar': []
}>()

const authStore = useAuthStore()
const router = useRouter()
const userMenuOpen = ref(false)

async function handleSignOut() {
  userMenuOpen.value = false
  await authStore.logout()
  router.push({ name: 'login' })
}
</script>

<template>
  <header
    class="sticky top-0 before:absolute before:inset-0 before:backdrop-blur-md max-lg:before:bg-white/90 dark:max-lg:before:bg-gray-800/90 before:-z-10 z-30 max-lg:shadow-xs lg:before:bg-gray-100/90 dark:lg:before:bg-gray-900/90"
  >
    <div class="px-4 sm:px-6 lg:px-8">
      <div
        class="flex items-center justify-between h-16 lg:border-b border-gray-200 dark:border-gray-700/60"
      >
        <!-- Left: hamburger (mobile) -->
        <div class="flex">
          <button
            class="text-gray-500 hover:text-gray-600 dark:hover:text-gray-400 lg:hidden"
            aria-controls="sidebar"
            :aria-expanded="sidebarOpen"
            @click.stop="$emit('toggle-sidebar')"
          >
            <span class="sr-only">Open sidebar</span>
            <svg
              class="w-6 h-6 fill-current"
              viewBox="0 0 24 24"
              xmlns="http://www.w3.org/2000/svg"
            >
              <rect x="4" y="5" width="16" height="2" />
              <rect x="4" y="11" width="16" height="2" />
              <rect x="4" y="17" width="16" height="2" />
            </svg>
          </button>
        </div>

        <!-- Right: admin link + notifications + theme toggle + user menu -->
        <div class="flex items-center space-x-3">
          <!-- Admin link (visible only to admins) -->
          <RouterLink
            v-if="authStore.isAdmin"
            to="/admin"
            class="text-sm font-medium text-violet-500 hover:text-violet-600 dark:hover:text-violet-400 transition"
          >
            Admin
          </RouterLink>

          <AppNotifications />
          <ThemeToggle />

          <!-- User menu -->
          <div class="relative inline-flex">
            <button
              class="inline-flex items-center justify-center group"
              aria-haspopup="true"
              :aria-expanded="userMenuOpen"
              @click.stop="userMenuOpen = !userMenuOpen"
            >
              <div class="flex items-center truncate">
                <span
                  class="truncate ml-2 text-sm font-medium text-gray-600 dark:text-gray-100 group-hover:text-gray-800 dark:group-hover:text-white"
                  >{{ authStore.displayName || 'User' }}</span
                >
                <svg
                  class="w-3 h-3 shrink-0 ml-1 fill-current text-gray-400 dark:text-gray-500"
                  viewBox="0 0 12 12"
                >
                  <path d="M5.9 11.4L.5 6l1.4-1.4 4 4 4-4L11.3 6z" />
                </svg>
              </div>
            </button>
            <Transition
              enter-active-class="transition ease-out duration-200"
              enter-from-class="opacity-0 -translate-y-1"
              enter-to-class="opacity-100 translate-y-0"
              leave-active-class="transition ease-out duration-200"
              leave-from-class="opacity-100 translate-y-0"
              leave-to-class="opacity-0 -translate-y-1"
            >
              <div
                v-show="userMenuOpen"
                class="origin-top-right z-10 absolute top-full min-w-44 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700/60 py-1.5 rounded-lg shadow-lg overflow-hidden mt-1 right-0"
                @focusin="userMenuOpen = true"
                @focusout="userMenuOpen = false"
              >
                <div
                  class="pt-0.5 pb-2 px-3 mb-1 border-b border-gray-200 dark:border-gray-700/60"
                >
                  <div class="font-medium text-gray-800 dark:text-gray-100">
                    {{ authStore.displayName }}
                  </div>
                  <div class="text-xs text-gray-500 dark:text-gray-400 italic">
                    {{ authStore.user?.email }}
                  </div>
                </div>
                <ul>
                  <li>
                    <RouterLink
                      class="font-medium text-sm text-violet-500 hover:text-violet-600 dark:hover:text-violet-400 flex items-center py-1 px-3"
                      to="/settings"
                      @click="userMenuOpen = false"
                    >
                      Settings
                    </RouterLink>
                  </li>
                  <li>
                    <button
                      class="font-medium text-sm text-violet-500 hover:text-violet-600 dark:hover:text-violet-400 flex items-center py-1 px-3 w-full text-left"
                      @click="handleSignOut"
                    >
                      Sign Out
                    </button>
                  </li>
                </ul>
              </div>
            </Transition>
          </div>
        </div>
      </div>
    </div>
  </header>
</template>
