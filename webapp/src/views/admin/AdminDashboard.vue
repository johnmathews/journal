<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { apiFetch, ApiRequestError } from '@/api/client'

interface AdminUser {
  id: number
  email: string
  display_name: string
  is_admin: boolean
  is_active: boolean
  email_verified: boolean
  entry_count: number
  total_words: number
  job_count: number
  cost_estimate: number
  cost_this_week: number
  last_entry_at: string | null
  created_at: string
}

const users = ref<AdminUser[]>([])
const loading = ref(false)
const error = ref<string | null>(null)
const toggling = ref<number | null>(null)

onMounted(async () => {
  await loadUsers()
})

async function loadUsers() {
  loading.value = true
  error.value = null
  try {
    const response = await apiFetch<{ items: AdminUser[] }>('/api/admin/users')
    users.value = response.items
  } catch (e) {
    error.value =
      e instanceof ApiRequestError ? e.message : 'Failed to load users'
  } finally {
    loading.value = false
  }
}

async function toggleUserActive(user: AdminUser) {
  toggling.value = user.id
  error.value = null
  try {
    const newState = !user.is_active
    await apiFetch(`/api/admin/users/${user.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ is_active: newState }),
    })
    user.is_active = newState
  } catch (e) {
    error.value =
      e instanceof ApiRequestError ? e.message : 'Failed to update user'
  } finally {
    toggling.value = null
  }
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return 'Never'
  return new Date(dateStr).toLocaleDateString('en-GB', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

function formatNumber(n: number): string {
  return n.toLocaleString('en-US')
}
</script>

<template>
  <div>
    <!-- Error message -->
    <div
      v-if="error"
      class="mb-4 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700/60 px-4 py-3 text-sm text-red-700 dark:text-red-400"
    >
      {{ error }}
    </div>

    <div class="rounded-2xl bg-white dark:bg-gray-800 shadow-sm">
      <div v-if="loading" class="p-8 text-center">
        <svg
          class="animate-spin h-6 w-6 mx-auto text-violet-500"
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
      </div>

      <div v-else-if="users.length === 0" class="p-8 text-center">
        <p class="text-sm text-gray-500 dark:text-gray-400">No users found.</p>
      </div>

      <div v-else class="overflow-x-auto">
        <table class="w-full table-auto">
          <thead>
            <tr
              class="text-xs uppercase text-gray-400 dark:text-gray-500 border-b border-gray-100 dark:border-gray-700/60"
            >
              <th class="px-4 py-3 text-left font-semibold">Email</th>
              <th class="px-4 py-3 text-left font-semibold">Display Name</th>
              <th class="px-4 py-3 text-center font-semibold">Active</th>
              <th class="px-4 py-3 text-center font-semibold">Verified</th>
              <th class="px-4 py-3 text-right font-semibold">Entries</th>
              <th class="px-4 py-3 text-right font-semibold">Words</th>
              <th class="px-4 py-3 text-right font-semibold">Jobs</th>
              <th class="px-4 py-3 text-right font-semibold">Total Cost</th>
              <th class="px-4 py-3 text-right font-semibold">Cost (7d)</th>
              <th class="px-4 py-3 text-left font-semibold">Last Activity</th>
              <th class="px-4 py-3 text-right font-semibold">Actions</th>
            </tr>
          </thead>
          <tbody class="text-sm">
            <tr
              v-for="user in users"
              :key="user.id"
              class="border-b border-gray-100 dark:border-gray-700/60 last:border-0"
            >
              <td class="px-4 py-3 text-gray-800 dark:text-gray-100">
                {{ user.email }}
              </td>
              <td class="px-4 py-3 text-gray-600 dark:text-gray-300">
                {{ user.display_name }}
              </td>
              <td class="px-4 py-3 text-center">
                <span
                  class="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium"
                  :class="
                    user.is_active
                      ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400'
                      : 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400'
                  "
                >
                  {{ user.is_active ? 'Yes' : 'No' }}
                </span>
              </td>
              <td class="px-4 py-3 text-center">
                <span
                  class="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium"
                  :class="
                    user.email_verified
                      ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400'
                      : 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400'
                  "
                >
                  {{ user.email_verified ? 'Yes' : 'No' }}
                </span>
              </td>
              <td
                class="px-4 py-3 text-right text-gray-600 dark:text-gray-300 tabular-nums"
              >
                {{ formatNumber(user.entry_count) }}
              </td>
              <td
                class="px-4 py-3 text-right text-gray-600 dark:text-gray-300 tabular-nums"
              >
                {{ formatNumber(user.total_words) }}
              </td>
              <td
                class="px-4 py-3 text-right text-gray-600 dark:text-gray-300 tabular-nums"
              >
                {{ user.job_count }}
              </td>
              <td
                class="px-4 py-3 text-right text-gray-600 dark:text-gray-300 tabular-nums"
              >
                ${{ user.cost_estimate.toFixed(2) }}
              </td>
              <td
                class="px-4 py-3 text-right text-gray-600 dark:text-gray-300 tabular-nums"
              >
                ${{ user.cost_this_week.toFixed(2) }}
              </td>
              <td class="px-4 py-3 text-gray-500 dark:text-gray-400">
                {{ formatDate(user.last_entry_at) }}
              </td>
              <td class="px-4 py-3 text-right">
                <button
                  class="btn-xs"
                  :class="
                    user.is_active
                      ? 'bg-red-500 hover:bg-red-600 text-white'
                      : 'bg-green-500 hover:bg-green-600 text-white'
                  "
                  :disabled="toggling === user.id"
                  @click="toggleUserActive(user)"
                >
                  <svg
                    v-if="toggling === user.id"
                    class="animate-spin -ml-0.5 mr-1 h-3 w-3"
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
                  {{ user.is_active ? 'Disable' : 'Enable' }}
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>
</template>
