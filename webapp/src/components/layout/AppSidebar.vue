<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch } from 'vue'
import { useRoute } from 'vue-router'

const props = defineProps<{
  sidebarOpen: boolean
}>()

const emit = defineEmits<{
  'close-sidebar': []
}>()

const sidebar = ref<HTMLDivElement | null>(null)
const route = useRoute()

// Expanded-by-default behaviour:
//
// - If localStorage has an explicit value, honour it — the user's
//   stated preference always wins.
// - Otherwise fall back to a viewport check: wide displays (the
//   Tailwind `lg` breakpoint, 1024px+) start expanded, narrower
//   viewports start collapsed. The mobile hamburger state is a
//   separate ref (`sidebarOpen`), so this only affects the
//   desktop layout.
//
// Guarded for SSR / test environments where `window.matchMedia`
// may be missing — fall back to `false` rather than crashing.
const storedSidebarExpanded = localStorage.getItem('sidebar-expanded')

function defaultSidebarExpanded(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) return false
  return window.matchMedia('(min-width: 1024px)').matches
}

const sidebarExpanded = ref<boolean>(
  storedSidebarExpanded === null
    ? defaultSidebarExpanded()
    : storedSidebarExpanded === 'true',
)

// close on click outside
const clickHandler = (event: MouseEvent) => {
  const target = event.target as Node | null
  if (!sidebar.value || !target) return
  if (!props.sidebarOpen || sidebar.value.contains(target)) return
  emit('close-sidebar')
}

// auto-close the mobile overlay whenever navigation happens
watch(
  () => route.fullPath,
  () => {
    if (props.sidebarOpen) emit('close-sidebar')
  },
)

// close if ESC pressed
const keyHandler = (event: KeyboardEvent) => {
  if (!props.sidebarOpen || event.keyCode !== 27) return
  emit('close-sidebar')
}

onMounted(() => {
  document.addEventListener('click', clickHandler)
  document.addEventListener('keydown', keyHandler)
})

onUnmounted(() => {
  document.removeEventListener('click', clickHandler)
  document.removeEventListener('keydown', keyHandler)
})

watch(
  sidebarExpanded,
  () => {
    localStorage.setItem('sidebar-expanded', String(sidebarExpanded.value))
    const body = document.querySelector('body')
    if (!body) return
    if (sidebarExpanded.value) {
      body.classList.add('sidebar-expanded')
    } else {
      body.classList.remove('sidebar-expanded')
    }
  },
  { immediate: true },
)
</script>

<template>
  <div class="min-w-fit">
    <!-- Sidebar backdrop (mobile only) -->
    <div
      class="fixed inset-0 bg-gray-900/30 z-40 lg:hidden lg:z-auto transition-opacity duration-200"
      :class="sidebarOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'"
      aria-hidden="true"
    ></div>

    <!-- Sidebar -->
    <div
      id="sidebar"
      ref="sidebar"
      class="flex lg:flex! flex-col absolute z-40 left-0 top-0 lg:static lg:left-auto lg:top-auto lg:translate-x-0 h-[100dvh] overflow-y-scroll lg:overflow-y-auto no-scrollbar w-64 max-[400px]:w-full lg:w-20 lg:sidebar-expanded:!w-64 2xl:w-64! shrink-0 bg-white dark:bg-gray-800 p-4 transition-all duration-200 ease-in-out rounded-r-2xl shadow-xs"
      :class="sidebarOpen ? 'translate-x-0' : '-translate-x-full'"
    >
      <!-- Sidebar header -->
      <div class="flex justify-between mb-10 pr-3 sm:px-2">
        <!-- Logo / title — hidden when sidebar is collapsed on desktop -->
        <RouterLink class="block" to="/" aria-label="Journal home">
          <div>
            <h1
              class="text-2xl md:text-xl md:pl-2 text-gray-800 dark:text-gray-100 font-bold lg:opacity-0 lg:sidebar-expanded:opacity-100 2xl:opacity-100 duration-200 whitespace-nowrap overflow-hidden"
            >
              JOURNAL INSIGHTS TOOL
            </h1>
          </div>
        </RouterLink>
      </div>

      <!-- Links -->
      <div class="space-y-8">
        <div>
          <h2
            class="text-m uppercase text-gray-400 dark:text-gray-500 font-semibold pl-3 lg:hidden lg:sidebar-expanded:block 2xl:block"
          ></h2>
          <ul class="mt-3" @click="$emit('close-sidebar')">
            <!-- Dashboard link (home / `/`) -->
            <RouterLink
              v-slot="{ href, navigate, isExactActive }"
              to="/"
              custom
            >
              <li
                class="pl-4 pr-3 py-2 rounded-lg mb-0.5 last:mb-0 bg-linear-to-r"
                :class="
                  isExactActive &&
                  'from-violet-500/[0.12] dark:from-violet-500/[0.24] to-violet-500/[0.04]'
                "
              >
                <a
                  :href="href"
                  class="block truncate transition"
                  data-testid="sidebar-dashboard-link"
                  :class="
                    isExactActive
                      ? 'text-gray-900 dark:text-white'
                      : 'text-gray-800 dark:text-gray-100 hover:text-gray-900 dark:hover:text-white'
                  "
                  @click="navigate"
                >
                  <div class="flex items-center">
                    <svg
                      class="shrink-0 fill-current"
                      :class="
                        isExactActive
                          ? 'text-violet-500'
                          : 'text-gray-400 dark:text-gray-500'
                      "
                      xmlns="http://www.w3.org/2000/svg"
                      width="16"
                      height="16"
                      viewBox="0 0 16 16"
                    >
                      <path
                        d="M0 3a1 1 0 0 1 1-1h5a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H1a1 1 0 0 1-1-1V3Zm9 0a1 1 0 0 1 1-1h5a1 1 0 0 1 1 1v4a1 1 0 0 1-1 1h-5a1 1 0 0 1-1-1V3Zm0 7a1 1 0 0 1 1-1h5a1 1 0 0 1 1 1v3a1 1 0 0 1-1 1h-5a1 1 0 0 1-1-1v-3Z"
                      />
                    </svg>
                    <span
                      class="text-sm font-medium ml-4 lg:opacity-0 lg:sidebar-expanded:opacity-100 2xl:opacity-100 duration-200"
                      >Dashboard</span
                    >
                  </div>
                </a>
              </li>
            </RouterLink>

            <!-- Entries link -->
            <RouterLink
              v-slot="{ href, navigate, isActive }"
              to="/entries"
              custom
            >
              <li
                class="pl-4 pr-3 py-2 rounded-lg mb-0.5 last:mb-0 bg-linear-to-r"
                :class="
                  isActive &&
                  'from-violet-500/[0.12] dark:from-violet-500/[0.24] to-violet-500/[0.04]'
                "
              >
                <a
                  :href="href"
                  class="block truncate transition"
                  data-testid="sidebar-entries-link"
                  :class="
                    isActive
                      ? 'text-gray-900 dark:text-white'
                      : 'text-gray-800 dark:text-gray-100 hover:text-gray-900 dark:hover:text-white'
                  "
                  @click="navigate"
                >
                  <div class="flex items-center">
                    <svg
                      class="shrink-0 fill-current"
                      :class="
                        isActive
                          ? 'text-violet-500'
                          : 'text-gray-400 dark:text-gray-500'
                      "
                      xmlns="http://www.w3.org/2000/svg"
                      width="16"
                      height="16"
                      viewBox="0 0 16 16"
                    >
                      <path
                        d="M1 3a1 1 0 0 1 1-1h12a1 1 0 1 1 0 2H2a1 1 0 0 1-1-1Zm0 5a1 1 0 0 1 1-1h12a1 1 0 1 1 0 2H2a1 1 0 0 1-1-1Zm1 4a1 1 0 1 0 0 2h12a1 1 0 1 0 0-2H2Z"
                      />
                    </svg>
                    <span
                      class="text-sm font-medium ml-4 lg:opacity-0 lg:sidebar-expanded:opacity-100 2xl:opacity-100 duration-200"
                      >Entries</span
                    >
                  </div>
                </a>
              </li>
            </RouterLink>

            <!-- New Entry link -->
            <RouterLink
              v-slot="{ href, navigate, isExactActive }"
              to="/entries/new"
              custom
            >
              <li
                class="pl-4 pr-3 py-2 rounded-lg mb-0.5 last:mb-0 bg-linear-to-r"
                :class="
                  isExactActive &&
                  'from-violet-500/[0.12] dark:from-violet-500/[0.24] to-violet-500/[0.04]'
                "
              >
                <a
                  :href="href"
                  class="block truncate transition"
                  data-testid="sidebar-new-entry-link"
                  :class="
                    isExactActive
                      ? 'text-gray-900 dark:text-white'
                      : 'text-gray-800 dark:text-gray-100 hover:text-gray-900 dark:hover:text-white'
                  "
                  @click="navigate"
                >
                  <div class="flex items-center">
                    <svg
                      class="shrink-0 fill-current"
                      :class="
                        isExactActive
                          ? 'text-violet-500'
                          : 'text-gray-400 dark:text-gray-500'
                      "
                      xmlns="http://www.w3.org/2000/svg"
                      width="16"
                      height="16"
                      viewBox="0 0 16 16"
                    >
                      <path
                        d="M8 0a1 1 0 0 1 1 1v6h6a1 1 0 1 1 0 2H9v6a1 1 0 1 1-2 0V9H1a1 1 0 0 1 0-2h6V1a1 1 0 0 1 1-1z"
                      />
                    </svg>
                    <span
                      class="text-sm font-medium ml-4 lg:opacity-0 lg:sidebar-expanded:opacity-100 2xl:opacity-100 duration-200"
                      >New Entry</span
                    >
                  </div>
                </a>
              </li>
            </RouterLink>

            <!-- Search link -->
            <RouterLink
              v-slot="{ href, navigate, isActive }"
              to="/search"
              custom
            >
              <li
                class="pl-4 pr-3 py-2 rounded-lg mb-0.5 last:mb-0 bg-linear-to-r"
                :class="
                  isActive &&
                  'from-violet-500/[0.12] dark:from-violet-500/[0.24] to-violet-500/[0.04]'
                "
              >
                <a
                  :href="href"
                  class="block truncate transition"
                  data-testid="sidebar-search-link"
                  :class="
                    isActive
                      ? 'text-gray-900 dark:text-white'
                      : 'text-gray-800 dark:text-gray-100 hover:text-gray-900 dark:hover:text-white'
                  "
                  @click="navigate"
                >
                  <div class="flex items-center">
                    <svg
                      class="shrink-0 fill-current"
                      :class="
                        isActive
                          ? 'text-violet-500'
                          : 'text-gray-400 dark:text-gray-500'
                      "
                      xmlns="http://www.w3.org/2000/svg"
                      width="16"
                      height="16"
                      viewBox="0 0 16 16"
                    >
                      <path
                        d="M7 14c-3.86 0-7-3.14-7-7s3.14-7 7-7 7 3.14 7 7-3.14 7-7 7ZM7 2C4.243 2 2 4.243 2 7s2.243 5 5 5 5-2.243 5-5-2.243-5-5-5Z"
                      />
                      <path
                        d="M15.707 14.293 13.314 11.9a8.019 8.019 0 0 1-1.414 1.414l2.393 2.393a.997.997 0 0 0 1.414 0 .999.999 0 0 0 0-1.414Z"
                      />
                    </svg>
                    <span
                      class="text-sm font-medium ml-4 lg:opacity-0 lg:sidebar-expanded:opacity-100 2xl:opacity-100 duration-200"
                      >Search</span
                    >
                  </div>
                </a>
              </li>
            </RouterLink>

            <!-- Entities link -->
            <RouterLink
              v-slot="{ href, navigate, isActive }"
              to="/entities"
              custom
            >
              <li
                class="pl-4 pr-3 py-2 rounded-lg mb-0.5 last:mb-0 bg-linear-to-r"
                :class="
                  isActive &&
                  'from-violet-500/[0.12] dark:from-violet-500/[0.24] to-violet-500/[0.04]'
                "
              >
                <a
                  :href="href"
                  class="block truncate transition"
                  data-testid="sidebar-entities-link"
                  :class="
                    isActive
                      ? 'text-gray-900 dark:text-white'
                      : 'text-gray-800 dark:text-gray-100 hover:text-gray-900 dark:hover:text-white'
                  "
                  @click="navigate"
                >
                  <div class="flex items-center">
                    <svg
                      class="shrink-0 fill-current"
                      :class="
                        isActive
                          ? 'text-violet-500'
                          : 'text-gray-400 dark:text-gray-500'
                      "
                      xmlns="http://www.w3.org/2000/svg"
                      width="16"
                      height="16"
                      viewBox="0 0 16 16"
                    >
                      <path
                        d="M8 0a4 4 0 0 1 4 4v1a4 4 0 1 1-8 0V4a4 4 0 0 1 4-4Zm-5 13a5 5 0 0 1 10 0v3H3v-3Z"
                      />
                    </svg>
                    <span
                      class="text-sm font-medium ml-4 lg:opacity-0 lg:sidebar-expanded:opacity-100 2xl:opacity-100 duration-200"
                      >Entities</span
                    >
                  </div>
                </a>
              </li>
            </RouterLink>

            <!-- Job History link -->
            <RouterLink v-slot="{ href, navigate, isActive }" to="/jobs" custom>
              <li
                class="pl-4 pr-3 py-2 rounded-lg mb-0.5 last:mb-0 bg-linear-to-r"
                :class="
                  isActive &&
                  'from-violet-500/[0.12] dark:from-violet-500/[0.24] to-violet-500/[0.04]'
                "
              >
                <a
                  :href="href"
                  class="block truncate transition"
                  data-testid="sidebar-jobs-link"
                  :class="
                    isActive
                      ? 'text-gray-900 dark:text-white'
                      : 'text-gray-800 dark:text-gray-100 hover:text-gray-900 dark:hover:text-white'
                  "
                  @click="navigate"
                >
                  <div class="flex items-center">
                    <svg
                      class="shrink-0 fill-current"
                      :class="
                        isActive
                          ? 'text-violet-500'
                          : 'text-gray-400 dark:text-gray-500'
                      "
                      xmlns="http://www.w3.org/2000/svg"
                      width="16"
                      height="16"
                      viewBox="0 0 16 16"
                    >
                      <path
                        d="M8 0a8 8 0 1 1 0 16A8 8 0 0 1 8 0Zm0 2a6 6 0 1 0 0 12A6 6 0 0 0 8 2Zm.5 2v4.25l2.85 1.65-.75 1.3L7.5 9V4h1Z"
                      />
                    </svg>
                    <span
                      class="text-sm font-medium ml-4 lg:opacity-0 lg:sidebar-expanded:opacity-100 2xl:opacity-100 duration-200"
                      >Job History</span
                    >
                  </div>
                </a>
              </li>
            </RouterLink>
          </ul>
        </div>
      </div>

      <!-- Expand / collapse button -->
      <div class="pt-3 hidden lg:inline-flex 2xl:hidden justify-end mt-auto">
        <div class="w-12 pl-4 pr-3 py-2">
          <button
            class="text-gray-400 hover:text-gray-500 dark:text-gray-500 dark:hover:text-gray-400"
            @click.prevent="sidebarExpanded = !sidebarExpanded"
          >
            <span class="sr-only">Expand / collapse sidebar</span>
            <svg
              class="shrink-0 fill-current text-gray-400 dark:text-gray-500 sidebar-expanded:rotate-180"
              xmlns="http://www.w3.org/2000/svg"
              width="16"
              height="16"
              viewBox="0 0 16 16"
            >
              <path
                d="M15 16a1 1 0 0 1-1-1V1a1 1 0 1 1 2 0v14a1 1 0 0 1-1 1ZM8.586 7H1a1 1 0 1 0 0 2h7.586l-2.793 2.793a1 1 0 1 0 1.414 1.414l4.5-4.5A.997.997 0 0 0 12 8.01M11.924 7.617a.997.997 0 0 0-.217-.324l-4.5-4.5a1 1 0 0 0-1.414 1.414L8.586 7M12 7.99a.996.996 0 0 0-.076-.373Z"
              />
            </svg>
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
