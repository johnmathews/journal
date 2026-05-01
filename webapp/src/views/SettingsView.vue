<script setup lang="ts">
import { computed, ref } from 'vue'
import { useAuthStore } from '@/stores/auth'
import { useJobsStore } from '@/stores/jobs'
import { useDashboardStore } from '@/stores/dashboard'
import { useSettingsStore } from '@/stores/settings'
import { triggerEntityExtraction } from '@/api/entities'
import BatchJobModal from '@/components/BatchJobModal.vue'
import NotificationsSettings from '@/components/NotificationsSettings.vue'

const authStore = useAuthStore()
const jobsStore = useJobsStore()
const dashboardStore = useDashboardStore()
const settingsStore = useSettingsStore()

// Settings store is loaded lazily — we only need it to know whether mood
// scoring is enabled, which gates the mood-backfill button.
settingsStore.load()

const moodScoringEnabled = computed(
  () => settingsStore.settings?.features.mood_scoring ?? false,
)

// --- Profile: display name editing ------------------------------------------

const editingName = ref(false)
const nameInput = ref('')
const nameSaving = ref(false)
const nameError = ref<string | null>(null)
const showReextractPrompt = ref(false)
const reextractSubmitting = ref(false)

function startEditingName() {
  nameInput.value = authStore.displayName
  nameError.value = null
  editingName.value = true
}

function cancelEditingName() {
  editingName.value = false
  nameError.value = null
}

async function saveDisplayName() {
  const trimmed = nameInput.value.trim()
  if (!trimmed) {
    nameError.value = 'Name cannot be empty'
    return
  }
  if (trimmed === authStore.displayName) {
    editingName.value = false
    return
  }
  nameSaving.value = true
  nameError.value = null
  try {
    await authStore.updateDisplayName(trimmed)
    editingName.value = false
    showReextractPrompt.value = true
  } catch {
    nameError.value = 'Failed to update name'
  } finally {
    nameSaving.value = false
  }
}

async function triggerReextraction() {
  reextractSubmitting.value = true
  try {
    const resp = await triggerEntityExtraction({ stale_only: false })
    jobsStore.trackJob(resp.job_id, 'entity_extraction', {})
    showReextractPrompt.value = false
  } catch {
    // Prompt stays open so user can retry
  } finally {
    reextractSubmitting.value = false
  }
}

function dismissReextractPrompt() {
  showReextractPrompt.value = false
}

// --- Maintenance: per-user batch jobs ---------------------------------------

const showMoodBackfillModal = ref(false)
const showEntityExtractionModal = ref(false)

async function onMoodJobSucceeded(): Promise<void> {
  await dashboardStore.loadMoodTrends()
}
</script>

<template>
  <main class="px-4 sm:px-6 lg:px-8 py-8 w-full max-w-5xl mx-auto">
    <h1
      class="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-6"
      data-testid="settings-heading"
    >
      Settings
    </h1>

    <!-- Profile -->
    <section class="mb-8" data-testid="profile-section">
      <h2 class="text-lg font-semibold text-gray-800 dark:text-gray-200 mb-4">
        Profile
      </h2>
      <div
        class="p-4 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700/60 rounded-xl shadow-xs"
      >
        <dl
          class="grid grid-cols-1 sm:grid-cols-[10rem_1fr] gap-x-6 gap-y-3 text-sm"
        >
          <dt class="text-gray-600 dark:text-gray-300">Email</dt>
          <dd
            class="font-medium text-gray-900 dark:text-gray-100"
            data-testid="profile-email"
          >
            {{ authStore.user?.email ?? '—' }}
          </dd>

          <dt class="text-gray-600 dark:text-gray-300">Display Name</dt>
          <dd
            class="font-medium text-gray-900 dark:text-gray-100"
            data-testid="profile-display-name"
          >
            <template v-if="!editingName">
              <span data-testid="display-name-value">{{
                authStore.displayName
              }}</span>
              <button
                class="ml-2 text-xs text-violet-500 hover:text-violet-600 dark:hover:text-violet-400"
                data-testid="display-name-edit-btn"
                @click="startEditingName"
              >
                Edit
              </button>
              <p class="text-xs text-gray-600 dark:text-gray-300 mt-1">
                Used as the author name during entity extraction. Use your full
                name (e.g. John Mathews) for accurate first-person resolution.
              </p>
            </template>
            <template v-else>
              <div class="flex items-center gap-2 mt-1">
                <input
                  v-model="nameInput"
                  type="text"
                  class="form-input text-sm py-1 px-2 w-64"
                  data-testid="display-name-input"
                  @keyup.enter="saveDisplayName"
                  @keyup.escape="cancelEditingName"
                />
                <button
                  class="text-xs text-emerald-600 hover:text-emerald-700 dark:text-emerald-400 dark:hover:text-emerald-300 disabled:opacity-50"
                  data-testid="display-name-save-btn"
                  :disabled="nameSaving"
                  @click="saveDisplayName"
                >
                  {{ nameSaving ? 'Saving...' : 'Save' }}
                </button>
                <button
                  class="text-xs text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
                  data-testid="display-name-cancel-btn"
                  @click="cancelEditingName"
                >
                  Cancel
                </button>
              </div>
              <p
                v-if="nameError"
                class="text-xs text-red-600 dark:text-red-400 mt-1"
                data-testid="display-name-error"
              >
                {{ nameError }}
              </p>
            </template>
          </dd>
        </dl>

        <!-- Re-extract prompt -->
        <div
          v-if="showReextractPrompt"
          class="mt-4 p-4 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700/60 rounded-xl"
          data-testid="reextract-prompt"
        >
          <p class="text-sm text-amber-800 dark:text-amber-200 mb-3">
            Display name changed. Re-run entity extraction on all entries so
            first-person pronouns resolve to the updated name?
          </p>
          <div class="flex gap-2">
            <button
              class="btn text-xs bg-amber-600 hover:bg-amber-700 text-white disabled:opacity-50"
              data-testid="reextract-confirm-btn"
              :disabled="reextractSubmitting"
              @click="triggerReextraction"
            >
              {{ reextractSubmitting ? 'Submitting...' : 'Re-run extraction' }}
            </button>
            <button
              class="btn text-xs bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600"
              data-testid="reextract-dismiss-btn"
              @click="dismissReextractPrompt"
            >
              Skip
            </button>
          </div>
        </div>
      </div>
    </section>

    <!-- Maintenance -->
    <section class="mb-8" data-testid="maintenance-section">
      <h2 class="text-lg font-semibold text-gray-800 dark:text-gray-200 mb-4">
        Maintenance
      </h2>
      <p class="text-xs text-gray-600 dark:text-gray-300 mb-3">
        These jobs operate only on your own entries.
      </p>
      <div class="space-y-4">
        <div
          class="p-4 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700/60 rounded-xl shadow-xs"
          data-testid="job-mood-backfill"
        >
          <div class="flex items-center justify-between">
            <div class="flex-1 min-w-0 mr-4">
              <p class="text-sm font-medium text-gray-700 dark:text-gray-300">
                Mood Backfill
              </p>
              <p class="text-xs text-gray-600 dark:text-gray-300">
                Score your entries for mood dimensions. Run on new entries or
                re-score existing ones.
              </p>
            </div>
            <button
              type="button"
              class="btn-sm bg-violet-500 hover:bg-violet-600 text-white"
              :disabled="!moodScoringEnabled"
              :title="
                moodScoringEnabled
                  ? 'Run mood backfill'
                  : 'Mood scoring is disabled'
              "
              data-testid="run-mood-backfill-button"
              @click="showMoodBackfillModal = true"
            >
              Run
            </button>
          </div>
        </div>

        <div
          class="p-4 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700/60 rounded-xl shadow-xs"
          data-testid="job-entity-extraction"
        >
          <div class="flex items-center justify-between">
            <div class="flex-1 min-w-0 mr-4">
              <p class="text-sm font-medium text-gray-700 dark:text-gray-300">
                Entity Extraction
              </p>
              <p class="text-xs text-gray-600 dark:text-gray-300">
                Extract people, places, and other entities from your entries.
              </p>
            </div>
            <button
              type="button"
              class="btn-sm bg-violet-500 hover:bg-violet-600 text-white"
              data-testid="run-entity-extraction-button"
              @click="showEntityExtractionModal = true"
            >
              Run
            </button>
          </div>
        </div>
      </div>
    </section>

    <BatchJobModal
      v-model="showMoodBackfillModal"
      title="Run mood backfill"
      job-kind="mood_backfill"
      @job-succeeded="onMoodJobSucceeded"
    />
    <BatchJobModal
      v-model="showEntityExtractionModal"
      title="Run entity extraction"
      job-kind="entity_extraction"
    />

    <!-- Notifications -->
    <NotificationsSettings />
  </main>
</template>
