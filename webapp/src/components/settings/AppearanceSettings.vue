<script setup lang="ts">
// Settings → Appearance: the accent colour, as a row of swatches (decided 2026-11-26,
// brand/design-system/mockups/261126-appearance-setting). Picking one recolours the app at once
// and saves it to the account; the page itself is the preview.
import { computed } from 'vue'
import { ACCENTS, type AccentId } from '@/brand/accents'
import { useAppearanceStore } from '@/stores/appearance'

const appearance = useAppearanceStore()

const status = computed(() => {
  switch (appearance.saveState) {
    case 'saving':
      return 'Saving…'
    case 'saved':
      return 'Saved'
    case 'error':
      return 'Couldn’t save the colour. Check your connection and pick it again.'
    default:
      return ''
  }
})

function pick(id: AccentId) {
  appearance.setAccent(id)
}
</script>

<template>
  <div
    class="p-4 sm:p-5 bg-white dark:bg-gray-800 [--swatch-gap:#fff] dark:[--swatch-gap:var(--color-gray-800)] border border-gray-200 dark:border-gray-700/60 rounded-xl shadow-xs"
    data-testid="appearance-accent"
  >
    <fieldset>
      <legend class="text-base font-semibold text-gray-800 dark:text-gray-100">
        Accent colour
      </legend>
      <p class="mt-1 text-sm text-gray-600 dark:text-gray-300 max-w-prose">
        The app icon, buttons, links, the current page in the sidebar and
        selected items use this colour. It’s saved to your account, so it
        applies on every device.
      </p>

      <div class="mt-4 flex flex-wrap gap-x-5 gap-y-4">
        <label
          v-for="option in ACCENTS"
          :key="option.id"
          class="relative grid justify-items-center gap-1.5 cursor-pointer text-[13px]"
          :class="
            appearance.accent === option.id
              ? 'text-gray-800 dark:text-gray-100 font-semibold'
              : 'text-gray-600 dark:text-gray-300'
          "
          :data-testid="`accent-option-${option.id}`"
        >
          <input
            type="radio"
            name="accent"
            class="peer sr-only"
            :value="option.id"
            :checked="appearance.accent === option.id"
            @change="pick(option.id)"
          />
          <span
            class="block w-9 h-9 rounded-full peer-focus-visible:outline-2 peer-focus-visible:outline-offset-4 peer-focus-visible:outline-gray-800 dark:peer-focus-visible:outline-gray-100"
            :style="{
              backgroundColor: option.swatch,
              boxShadow:
                appearance.accent === option.id
                  ? `0 0 0 2px var(--swatch-gap), 0 0 0 4px ${option.swatch}`
                  : undefined,
            }"
            aria-hidden="true"
          />
          {{ option.name }}
        </label>
      </div>
    </fieldset>

    <p
      class="mt-4 min-h-5 text-xs"
      :class="
        appearance.saveState === 'error'
          ? 'text-error-ink'
          : 'text-gray-600 dark:text-gray-300'
      "
      aria-live="polite"
      data-testid="appearance-status"
    >
      {{ status }}
    </p>
  </div>
</template>
