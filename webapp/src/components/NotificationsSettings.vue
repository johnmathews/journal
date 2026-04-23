<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useNotificationsStore } from '@/stores/notifications'
import { useAuthStore } from '@/stores/auth'
import { useToast } from '@/composables/useToast'

const store = useNotificationsStore()
const authStore = useAuthStore()
const toast = useToast()

const showToken = ref(false)
const showKey = ref(false)

const CREDENTIAL_MASK = '••••••••••••••••••••••••••••••'
const editingToken = ref(false)
const editingKey = ref(false)

function onTokenFocus() {
  editingToken.value = true
}

function onTokenBlur() {
  if (!store.apiToken) editingToken.value = false
}

function onKeyFocus() {
  editingKey.value = true
}

function onKeyBlur() {
  if (!store.userKey) editingKey.value = false
}

onMounted(() => store.load())

async function handleSendTest() {
  await store.sendTest()
  if (store.testResult?.sent) {
    toast.success('Test notification sent')
  } else {
    toast.error(store.testResult?.error || 'Failed to send test notification')
  }
}

const successTopics = () => store.topics.filter((t) => t.group === 'success')
const failureTopics = () => store.topics.filter((t) => t.group === 'failure')
const adminTopics = () => store.topics.filter((t) => t.group === 'admin')
</script>

<template>
  <section class="mb-8 mt-8" data-testid="notifications-section">
    <div class="flex items-center gap-3 mb-4">
      <h2 class="text-lg font-semibold text-gray-800 dark:text-gray-200">
        Notifications
      </h2>
      <span
        v-if="store.isConfigured"
        class="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/30 px-2 py-0.5 rounded-full"
        data-testid="notif-status-configured"
      >
        Configured
      </span>
      <span
        v-else
        class="inline-flex items-center gap-1.5 text-xs font-medium text-gray-600 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 px-2 py-0.5 rounded-full"
        data-testid="notif-status-not-configured"
      >
        Not configured
      </span>
    </div>

    <div
      class="p-4 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700/60 rounded-xl shadow-xs space-y-6"
    >
      <!-- Pushover Credentials -->
      <div class="space-y-4">
        <h3
          class="text-sm font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider"
        >
          Pushover Credentials
        </h3>

        <!-- API Token -->
        <div>
          <label class="block text-xs text-gray-600 dark:text-gray-300 mb-1"
            >API Token</label
          >
          <div class="relative">
            <input
              v-model="store.apiToken"
              :type="showToken ? 'text' : 'password'"
              class="form-input w-full pr-10 text-sm"
              :placeholder="
                store.credentialsSaved && !editingToken
                  ? CREDENTIAL_MASK
                  : 'Enter your Pushover app API token'
              "
              data-testid="pushover-token-input"
              @focus="onTokenFocus"
              @blur="onTokenBlur"
            />
            <button
              type="button"
              class="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
              data-testid="toggle-show-token"
              @click="showToken = !showToken"
            >
              <!-- eye icon -->
              <svg
                v-if="!showToken"
                class="w-4 h-4"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                stroke-width="1.5"
              >
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  d="M2.036 12.322a1.012 1.012 0 0 1 0-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178Z"
                />
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z"
                />
              </svg>
              <!-- eye-slash icon -->
              <svg
                v-else
                class="w-4 h-4"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                stroke-width="1.5"
              >
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  d="M3.98 8.223A10.477 10.477 0 0 0 1.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.451 10.451 0 0 1 12 4.5c4.756 0 8.773 3.162 10.065 7.498a10.522 10.522 0 0 1-4.293 5.774M6.228 6.228 3 3m3.228 3.228 3.65 3.65m7.894 7.894L21 21m-3.228-3.228-3.65-3.65m0 0a3 3 0 1 0-4.243-4.243m4.242 4.242L9.88 9.88"
                />
              </svg>
            </button>
          </div>
        </div>

        <!-- User Key -->
        <div>
          <label class="block text-xs text-gray-600 dark:text-gray-300 mb-1"
            >User Key</label
          >
          <div class="relative">
            <input
              v-model="store.userKey"
              :type="showKey ? 'text' : 'password'"
              class="form-input w-full pr-10 text-sm"
              :placeholder="
                store.credentialsSaved && !editingKey
                  ? CREDENTIAL_MASK
                  : 'Enter your Pushover user key'
              "
              data-testid="pushover-key-input"
              @focus="onKeyFocus"
              @blur="onKeyBlur"
            />
            <button
              type="button"
              class="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
              data-testid="toggle-show-key"
              @click="showKey = !showKey"
            >
              <svg
                v-if="!showKey"
                class="w-4 h-4"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                stroke-width="1.5"
              >
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  d="M2.036 12.322a1.012 1.012 0 0 1 0-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178Z"
                />
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z"
                />
              </svg>
              <svg
                v-else
                class="w-4 h-4"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                stroke-width="1.5"
              >
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  d="M3.98 8.223A10.477 10.477 0 0 0 1.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.451 10.451 0 0 1 12 4.5c4.756 0 8.773 3.162 10.065 7.498a10.522 10.522 0 0 1-4.293 5.774M6.228 6.228 3 3m3.228 3.228 3.65 3.65m7.894 7.894L21 21m-3.228-3.228-3.65-3.65m0 0a3 3 0 1 0-4.243-4.243m4.242 4.242L9.88 9.88"
                />
              </svg>
            </button>
          </div>
        </div>

        <!-- Validation status -->
        <div
          v-if="store.validationStatus !== 'unchecked'"
          class="flex items-center gap-2 text-sm"
          data-testid="validation-status"
        >
          <span
            v-if="store.validationStatus === 'valid'"
            class="text-emerald-600 dark:text-emerald-400"
          >
            &#10003; Credentials are valid
          </span>
          <span
            v-else-if="store.validationStatus === 'invalid'"
            class="text-red-600 dark:text-red-400"
          >
            {{ store.validationMessage || 'Invalid credentials' }}
          </span>
          <span
            v-else-if="store.validationStatus === 'validating'"
            class="text-gray-600 dark:text-gray-300"
          >
            Validating...
          </span>
        </div>

        <!-- Action buttons -->
        <div class="flex gap-2">
          <button
            type="button"
            class="btn-sm bg-violet-500 hover:bg-violet-600 text-white disabled:opacity-50"
            :disabled="store.validating || !store.apiToken || !store.userKey"
            data-testid="validate-button"
            @click="store.validate()"
          >
            {{ store.validating ? 'Validating...' : 'Validate' }}
          </button>
          <button
            type="button"
            class="btn-sm bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700/60 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50"
            :disabled="store.sendingTest || !store.topicsEnabled"
            data-testid="send-test-button"
            @click="handleSendTest()"
          >
            {{ store.sendingTest ? 'Sending...' : 'Send Test' }}
          </button>
        </div>

        <!-- Test result -->
        <div v-if="store.testResult" class="text-sm" data-testid="test-result">
          <span
            v-if="store.testResult.sent"
            class="text-emerald-600 dark:text-emerald-400"
          >
            &#10003; Test notification sent successfully
          </span>
          <span v-else class="text-red-600 dark:text-red-400">
            {{ store.testResult.error || 'Failed to send' }}
          </span>
        </div>
      </div>

      <!-- Divider -->
      <div class="border-t border-gray-100 dark:border-gray-700/60" />

      <!-- Notification Topics -->
      <div
        :class="{ 'opacity-50 pointer-events-none': !store.topicsEnabled }"
        data-testid="topics-section"
      >
        <p
          v-if="!store.topicsEnabled"
          class="text-xs text-gray-600 dark:text-gray-300 mb-4"
        >
          Save valid credentials to enable notification topics.
        </p>

        <!-- Success Notifications -->
        <div v-if="successTopics().length" class="mb-4">
          <p
            class="text-xs font-semibold uppercase tracking-wider text-gray-600 dark:text-gray-300 mb-2"
          >
            Success Notifications
          </p>
          <div class="space-y-3">
            <div
              v-for="topic in successTopics()"
              :key="topic.key"
              class="flex items-center justify-between"
              :data-testid="`topic-${topic.key}`"
            >
              <p class="text-sm font-medium text-gray-700 dark:text-gray-300">
                {{ topic.label }}
              </p>
              <button
                type="button"
                :class="[
                  'relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-violet-500 focus:ring-offset-2 dark:focus:ring-offset-gray-900',
                  topic.enabled
                    ? 'bg-violet-500'
                    : 'bg-gray-200 dark:bg-gray-600',
                ]"
                role="switch"
                :aria-checked="topic.enabled"
                @click="store.setTopic(topic.key, !topic.enabled)"
              >
                <span
                  :class="[
                    'pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out',
                    topic.enabled ? 'translate-x-5' : 'translate-x-0',
                  ]"
                />
              </button>
            </div>
          </div>
        </div>

        <!-- Failure Notifications -->
        <div v-if="failureTopics().length" class="mb-4">
          <p
            class="text-xs font-semibold uppercase tracking-wider text-gray-600 dark:text-gray-300 mb-2"
          >
            Failure Notifications
          </p>
          <div class="space-y-3">
            <div
              v-for="topic in failureTopics()"
              :key="topic.key"
              class="flex items-center justify-between"
              :data-testid="`topic-${topic.key}`"
            >
              <p class="text-sm font-medium text-gray-700 dark:text-gray-300">
                {{ topic.label }}
              </p>
              <button
                type="button"
                :class="[
                  'relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-violet-500 focus:ring-offset-2 dark:focus:ring-offset-gray-900',
                  topic.enabled
                    ? 'bg-violet-500'
                    : 'bg-gray-200 dark:bg-gray-600',
                ]"
                role="switch"
                :aria-checked="topic.enabled"
                @click="store.setTopic(topic.key, !topic.enabled)"
              >
                <span
                  :class="[
                    'pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out',
                    topic.enabled ? 'translate-x-5' : 'translate-x-0',
                  ]"
                />
              </button>
            </div>
          </div>
        </div>

        <!-- Admin Notifications -->
        <div v-if="authStore.isAdmin && adminTopics().length">
          <p
            class="text-xs font-semibold uppercase tracking-wider text-gray-600 dark:text-gray-300 mb-2"
          >
            Admin Notifications
          </p>
          <div class="space-y-3">
            <div
              v-for="topic in adminTopics()"
              :key="topic.key"
              class="flex items-center justify-between"
              :data-testid="`topic-${topic.key}`"
            >
              <p class="text-sm font-medium text-gray-700 dark:text-gray-300">
                {{ topic.label }}
              </p>
              <button
                type="button"
                :class="[
                  'relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-violet-500 focus:ring-offset-2 dark:focus:ring-offset-gray-900',
                  topic.enabled
                    ? 'bg-violet-500'
                    : 'bg-gray-200 dark:bg-gray-600',
                ]"
                role="switch"
                :aria-checked="topic.enabled"
                @click="store.setTopic(topic.key, !topic.enabled)"
              >
                <span
                  :class="[
                    'pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out',
                    topic.enabled ? 'translate-x-5' : 'translate-x-0',
                  ]"
                />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  </section>
</template>
