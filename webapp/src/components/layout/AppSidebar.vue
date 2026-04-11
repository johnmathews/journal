<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch } from 'vue'

const props = defineProps<{
  sidebarOpen: boolean
}>()

const emit = defineEmits<{
  'close-sidebar': []
}>()

const trigger = ref<HTMLButtonElement | null>(null)
const sidebar = ref<HTMLDivElement | null>(null)

const storedSidebarExpanded = localStorage.getItem('sidebar-expanded')
const sidebarExpanded = ref<boolean>(
  storedSidebarExpanded === null ? false : storedSidebarExpanded === 'true',
)

// close on click outside
const clickHandler = (event: MouseEvent) => {
  const target = event.target as Node | null
  if (!sidebar.value || !trigger.value || !target) return
  if (
    !props.sidebarOpen ||
    sidebar.value.contains(target) ||
    trigger.value.contains(target)
  )
    return
  emit('close-sidebar')
}

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

watch(sidebarExpanded, () => {
  localStorage.setItem('sidebar-expanded', String(sidebarExpanded.value))
  const body = document.querySelector('body')
  if (!body) return
  if (sidebarExpanded.value) {
    body.classList.add('sidebar-expanded')
  } else {
    body.classList.remove('sidebar-expanded')
  }
})
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
      class="flex lg:flex! flex-col absolute z-40 left-0 top-0 lg:static lg:left-auto lg:top-auto lg:translate-x-0 h-[100dvh] overflow-y-scroll lg:overflow-y-auto no-scrollbar w-64 lg:w-20 lg:sidebar-expanded:!w-64 2xl:w-64! shrink-0 bg-white dark:bg-gray-800 p-4 transition-all duration-200 ease-in-out rounded-r-2xl shadow-xs"
      :class="sidebarOpen ? 'translate-x-0' : '-translate-x-64'"
    >
      <!-- Sidebar header -->
      <div class="flex justify-between mb-10 pr-3 sm:px-2">
        <!-- Close button -->
        <button
          ref="trigger"
          class="lg:hidden text-gray-500 hover:text-gray-400"
          aria-controls="sidebar"
          :aria-expanded="sidebarOpen"
          @click.stop="$emit('close-sidebar')"
        >
          <span class="sr-only">Close sidebar</span>
          <svg
            class="w-6 h-6 fill-current"
            viewBox="0 0 24 24"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path
              d="M10.7 18.7l1.4-1.4L7.8 13H20v-2H7.8l4.3-4.3-1.4-1.4L4 12z"
            />
          </svg>
        </button>
        <!-- Logo -->
        <RouterLink class="block" to="/">
          <svg
            class="fill-violet-500"
            xmlns="http://www.w3.org/2000/svg"
            width="32"
            height="32"
          >
            <path
              d="M31.956 14.8C31.372 6.92 25.08.628 17.2.044V5.76a9.04 9.04 0 0 0 9.04 9.04h5.716ZM14.8 26.24v5.716C6.92 31.372.63 25.08.044 17.2H5.76a9.04 9.04 0 0 1 9.04 9.04Zm11.44-9.04h5.716c-.584 7.88-6.876 14.172-14.756 14.756V26.24a9.04 9.04 0 0 1 9.04-9.04ZM.044 14.8C.63 6.92 6.92.628 14.8.044V5.76a9.04 9.04 0 0 1-9.04 9.04H.044Z"
            />
          </svg>
        </RouterLink>
      </div>

      <!-- Links -->
      <div class="space-y-8">
        <div>
          <h3
            class="text-xs uppercase text-gray-400 dark:text-gray-500 font-semibold pl-3"
          >
            <span
              class="hidden lg:block lg:sidebar-expanded:hidden 2xl:hidden text-center w-6"
              aria-hidden="true"
              >•••</span
            >
            <span class="lg:hidden lg:sidebar-expanded:block 2xl:block"
              >Journal</span
            >
          </h3>
          <ul class="mt-3">
            <!-- Entries link -->
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
