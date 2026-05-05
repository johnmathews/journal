<script setup lang="ts">
import { useRoute } from 'vue-router'

const route = useRoute()

const tabs = [
  { name: 'Overview', routeName: 'admin-overview', path: '/admin' },
  { name: 'Users', routeName: 'admin-users', path: '/admin/users' },
  { name: 'Runtime', routeName: 'admin-runtime', path: '/admin/runtime' },
  { name: 'Pricing', routeName: 'admin-pricing', path: '/admin/pricing' },
  { name: 'Server', routeName: 'admin-server', path: '/admin/server' },
  { name: 'Moods', routeName: 'admin-moods', path: '/admin/moods' },
] as const
</script>

<template>
  <div>
    <!-- Admin header with tab navigation -->
    <div class="mb-8">
      <h1
        class="text-2xl md:text-3xl text-gray-800 dark:text-gray-100 font-bold mb-4"
      >
        Administration
      </h1>
      <div class="border-b border-gray-200 dark:border-gray-700/60">
        <nav class="-mb-px flex space-x-6" aria-label="Admin tabs">
          <RouterLink
            v-for="tab in tabs"
            :key="tab.routeName"
            :to="tab.path"
            class="whitespace-nowrap border-b-2 py-3 px-1 text-sm font-medium transition"
            :class="
              route.name === tab.routeName
                ? 'border-violet-500 text-violet-600 dark:text-violet-400'
                : 'border-transparent text-gray-600 dark:text-gray-300 hover:text-gray-700 dark:hover:text-gray-300 hover:border-gray-300 dark:hover:border-gray-600'
            "
          >
            {{ tab.name }}
          </RouterLink>
        </nav>
      </div>
    </div>

    <RouterView />
  </div>
</template>
