<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { apiFetch, ApiRequestError } from '@/api/client'

interface ApiKey {
  id: number
  name: string
  prefix: string
  created_at: string
  last_used_at: string | null
  expires_at: string | null
}

interface CreateKeyResponse {
  id: number
  name: string
  prefix: string
  key: string
  created_at: string
  expires_at: string | null
}

const keys = ref<ApiKey[]>([])
const loading = ref(false)
const error = ref<string | null>(null)

// Create form state
const showCreateForm = ref(false)
const newKeyName = ref('')
const newKeyExpiry = ref('')
const creating = ref(false)

function cancelCreate() {
  showCreateForm.value = false
  newKeyName.value = ''
  newKeyExpiry.value = ''
}

// Newly created key (shown once)
const createdKey = ref<CreateKeyResponse | null>(null)
const copiedKey = ref(false)

onMounted(async () => {
  await loadKeys()
})

async function loadKeys() {
  loading.value = true
  error.value = null
  try {
    const response = await apiFetch<{ items: ApiKey[] }>('/api/auth/api-keys')
    keys.value = response.items
  } catch (e) {
    error.value =
      e instanceof ApiRequestError ? e.message : 'Failed to load API keys'
  } finally {
    loading.value = false
  }
}

async function createKey() {
  creating.value = true
  error.value = null
  try {
    const body: Record<string, string> = { name: newKeyName.value }
    if (newKeyExpiry.value) {
      body.expires_at = newKeyExpiry.value
    }
    const result = await apiFetch<CreateKeyResponse>('/api/auth/api-keys', {
      method: 'POST',
      body: JSON.stringify(body),
    })
    createdKey.value = result
    copiedKey.value = false
    showCreateForm.value = false
    newKeyName.value = ''
    newKeyExpiry.value = ''
    await loadKeys()
  } catch (e) {
    error.value =
      e instanceof ApiRequestError ? e.message : 'Failed to create API key'
  } finally {
    creating.value = false
  }
}

async function revokeKey(id: number) {
  if (
    !confirm(
      'Are you sure you want to revoke this API key? This cannot be undone.',
    )
  ) {
    return
  }
  error.value = null
  try {
    await apiFetch(`/api/auth/api-keys/${id}`, { method: 'DELETE' })
    keys.value = keys.value.filter((k) => k.id !== id)
  } catch (e) {
    error.value =
      e instanceof ApiRequestError ? e.message : 'Failed to revoke API key'
  }
}

async function copyToClipboard(text: string) {
  try {
    await navigator.clipboard.writeText(text)
    copiedKey.value = true
    setTimeout(() => {
      copiedKey.value = false
    }, 2000)
  } catch {
    // Fallback: select text for manual copy
  }
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return 'Never'
  return new Date(dateStr).toLocaleDateString('en-GB', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}
</script>

<template>
  <div class="max-w-4xl mx-auto">
    <div class="sm:flex sm:justify-between sm:items-center mb-8">
      <h1
        class="text-2xl md:text-3xl text-gray-800 dark:text-gray-100 font-bold"
      >
        API Keys
      </h1>
      <button
        v-if="!showCreateForm"
        class="btn bg-violet-500 hover:bg-violet-600 text-white mt-4 sm:mt-0"
        @click="showCreateForm = true"
      >
        Generate New Key
      </button>
    </div>

    <!-- Error message -->
    <div
      v-if="error"
      class="mb-4 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700/60 px-4 py-3 text-sm text-red-700 dark:text-red-400"
    >
      {{ error }}
    </div>

    <!-- Newly created key alert -->
    <div
      v-if="createdKey"
      class="mb-6 rounded-2xl bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-700/60 p-4"
    >
      <div class="flex items-start">
        <svg
          class="h-5 w-5 text-green-600 dark:text-green-400 mt-0.5 shrink-0"
          fill="none"
          viewBox="0 0 24 24"
          stroke-width="2"
          stroke="currentColor"
        >
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z"
          />
        </svg>
        <div class="ml-3 flex-1">
          <p class="text-sm font-medium text-green-800 dark:text-green-300">
            API key created: {{ createdKey.name }}
          </p>
          <p class="mt-1 text-sm text-green-700 dark:text-green-400">
            Copy this key now. You won't be able to see it again.
          </p>
          <div class="mt-3 flex items-center space-x-2">
            <code
              class="flex-1 block bg-white dark:bg-gray-800 rounded-lg px-3 py-2 text-sm font-mono text-gray-800 dark:text-gray-100 border border-green-200 dark:border-green-700/60 break-all"
            >
              {{ createdKey.key }}
            </code>
            <button
              class="btn-sm bg-green-600 hover:bg-green-700 text-white shrink-0"
              @click="copyToClipboard(createdKey.key)"
            >
              {{ copiedKey ? 'Copied!' : 'Copy' }}
            </button>
          </div>
          <button
            class="mt-2 text-sm text-green-600 dark:text-green-400 hover:underline"
            @click="createdKey = null"
          >
            Dismiss
          </button>
        </div>
      </div>
    </div>

    <!-- Create form -->
    <div
      v-if="showCreateForm"
      class="mb-6 rounded-2xl bg-white dark:bg-gray-800 shadow-sm p-5"
    >
      <h2 class="text-lg font-semibold text-gray-800 dark:text-gray-100 mb-4">
        Generate New API Key
      </h2>
      <form class="space-y-4" @submit.prevent="createKey">
        <div>
          <label
            for="key-name"
            class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
          >
            Key Name
          </label>
          <input
            id="key-name"
            v-model="newKeyName"
            type="text"
            class="form-input w-full sm:w-80"
            placeholder="e.g. MCP server, CI pipeline"
            required
          />
        </div>
        <div>
          <label
            for="key-expiry"
            class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
          >
            Expiry Date
            <span class="text-gray-600 dark:text-gray-300 font-normal"
              >(optional)</span
            >
          </label>
          <input
            id="key-expiry"
            v-model="newKeyExpiry"
            type="date"
            class="form-input w-full sm:w-80"
          />
        </div>
        <div class="flex items-center space-x-3">
          <button
            type="submit"
            class="btn bg-violet-500 hover:bg-violet-600 text-white disabled:opacity-50 disabled:cursor-not-allowed"
            :disabled="creating || !newKeyName.trim()"
          >
            <svg
              v-if="creating"
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
            {{ creating ? 'Creating...' : 'Create Key' }}
          </button>
          <button
            type="button"
            class="btn border-gray-200 dark:border-gray-700/60 hover:border-gray-300 dark:hover:border-gray-600 text-gray-600 dark:text-gray-300"
            @click="cancelCreate"
          >
            Cancel
          </button>
        </div>
      </form>
    </div>

    <!-- Keys table -->
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

      <div v-else-if="keys.length === 0" class="p-8 text-center">
        <p class="text-sm text-gray-600 dark:text-gray-300">
          No API keys yet. Generate one to get started.
        </p>
      </div>

      <div v-else class="overflow-x-auto">
        <table class="w-full table-auto">
          <thead>
            <tr
              class="text-xs uppercase text-gray-600 dark:text-gray-300 border-b border-gray-100 dark:border-gray-700/60"
            >
              <th class="px-5 py-3 text-left font-semibold">Name</th>
              <th class="px-5 py-3 text-left font-semibold">Prefix</th>
              <th class="px-5 py-3 text-left font-semibold">Created</th>
              <th class="px-5 py-3 text-left font-semibold">Last Used</th>
              <th class="px-5 py-3 text-left font-semibold">Expires</th>
              <th class="px-5 py-3 text-right font-semibold">Actions</th>
            </tr>
          </thead>
          <tbody class="text-sm">
            <tr
              v-for="key in keys"
              :key="key.id"
              class="border-b border-gray-100 dark:border-gray-700/60 last:border-0"
            >
              <td
                class="px-5 py-3 text-gray-800 dark:text-gray-100 font-medium"
              >
                {{ key.name }}
              </td>
              <td class="px-5 py-3">
                <code
                  class="text-xs bg-gray-100 dark:bg-gray-700 px-2 py-0.5 rounded font-mono text-gray-600 dark:text-gray-300"
                >
                  {{ key.prefix }}...
                </code>
              </td>
              <td class="px-5 py-3 text-gray-600 dark:text-gray-300">
                {{ formatDate(key.created_at) }}
              </td>
              <td class="px-5 py-3 text-gray-600 dark:text-gray-300">
                {{ formatDate(key.last_used_at) }}
              </td>
              <td class="px-5 py-3 text-gray-600 dark:text-gray-300">
                {{ key.expires_at ? formatDate(key.expires_at) : 'Never' }}
              </td>
              <td class="px-5 py-3 text-right">
                <button
                  class="btn-xs bg-red-500 hover:bg-red-600 text-white"
                  @click="revokeKey(key.id)"
                >
                  Revoke
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>
</template>
