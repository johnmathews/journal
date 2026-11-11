<script setup lang="ts">
import { nextTick, ref, useId, useSlots, watch } from 'vue'

const props = withDefaults(
  defineProps<{
    modelValue: boolean
    title: string
    size?: 'sm' | 'md' | 'lg'
  }>(),
  {
    size: 'md',
  },
)

const emit = defineEmits<{
  (e: 'update:modelValue', value: boolean): void
}>()

const slots = useSlots()

const panel = ref<HTMLElement | null>(null)
const titleId = useId()

const sizeClass: Record<'sm' | 'md' | 'lg', string> = {
  sm: 'max-w-sm',
  md: 'max-w-md',
  lg: 'max-w-lg',
}

// Track the element that had focus before the modal opened so we can
// restore it on close. Also remember the inline overflow value we
// clobbered so we can put it back exactly as it was.
let previouslyFocused: HTMLElement | null = null
let savedBodyOverflow: string | null = null

const FOCUSABLE_SELECTOR =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

function getFocusable(): HTMLElement[] {
  if (!panel.value) return []
  return Array.from(
    panel.value.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
  ).filter((el) => !el.hasAttribute('disabled'))
}

function close(): void {
  emit('update:modelValue', false)
}

function onBackdropClick(): void {
  close()
}

function onPanelClick(event: MouseEvent): void {
  // Prevent backdrop click handler from closing when clicking inside the panel.
  event.stopPropagation()
}

function onKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape') {
    event.preventDefault()
    close()
    return
  }

  if (event.key === 'Tab') {
    const focusable = getFocusable()
    if (focusable.length === 0) {
      event.preventDefault()
      return
    }
    const first = focusable[0]
    const last = focusable[focusable.length - 1]
    const active = document.activeElement as HTMLElement | null

    if (event.shiftKey) {
      if (active === first || !panel.value?.contains(active)) {
        event.preventDefault()
        last.focus()
      }
    } else {
      if (active === last || !panel.value?.contains(active)) {
        event.preventDefault()
        first.focus()
      }
    }
  }
}

async function handleOpen(): Promise<void> {
  previouslyFocused = document.activeElement as HTMLElement | null

  savedBodyOverflow = document.body.style.overflow
  document.body.style.overflow = 'hidden'

  document.addEventListener('keydown', onKeydown)

  await nextTick()
  const focusable = getFocusable()
  if (focusable.length > 0) {
    focusable[0].focus()
  } else if (panel.value) {
    // Fallback: focus the panel itself so the focus is at least inside the dialog.
    panel.value.focus()
  }
}

function handleClose(): void {
  document.removeEventListener('keydown', onKeydown)

  if (savedBodyOverflow !== null) {
    document.body.style.overflow = savedBodyOverflow
    savedBodyOverflow = null
  }

  if (previouslyFocused && typeof previouslyFocused.focus === 'function') {
    previouslyFocused.focus()
  }
  previouslyFocused = null
}

watch(
  () => props.modelValue,
  (value, previous) => {
    if (value && !previous) {
      void handleOpen()
    } else if (!value && previous) {
      handleClose()
    }
  },
  { immediate: true },
)
</script>

<template>
  <Teleport to="body">
    <div
      v-if="modelValue"
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      data-testid="modal-backdrop"
      @click="onBackdropClick"
    >
      <div
        ref="panel"
        role="dialog"
        aria-modal="true"
        :aria-labelledby="titleId"
        tabindex="-1"
        class="w-full bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700/60 rounded-xl shadow-lg text-gray-800 dark:text-gray-100 flex flex-col max-h-[90vh]"
        :class="sizeClass[size]"
        data-testid="modal-panel"
        @click="onPanelClick"
      >
        <!-- Header -->
        <div
          class="flex items-center justify-between px-5 py-4 border-b border-gray-200 dark:border-gray-700/60"
        >
          <h2
            :id="titleId"
            class="font-semibold text-gray-800 dark:text-gray-100"
            data-testid="modal-title"
          >
            {{ title }}
          </h2>
          <button
            type="button"
            class="text-gray-400 hover:text-gray-500 dark:text-gray-500 dark:hover:text-gray-400"
            aria-label="Close"
            data-testid="modal-close"
            @click="close"
          >
            <svg
              class="w-4 h-4 fill-current"
              viewBox="0 0 16 16"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                d="M7.95 6.536l4.242-4.243a1 1 0 1 1 1.415 1.414L9.364 7.95l4.243 4.242a1 1 0 1 1-1.415 1.415L7.95 9.364l-4.243 4.243a1 1 0 0 1-1.414-1.415L6.536 7.95 2.293 3.707a1 1 0 0 1 1.414-1.414L7.95 6.536z"
              />
            </svg>
          </button>
        </div>

        <!-- Body -->
        <div
          class="px-5 py-4 overflow-y-auto text-sm text-gray-600 dark:text-gray-300"
          data-testid="modal-body"
        >
          <slot />
        </div>

        <!-- Footer -->
        <div
          v-if="slots.footer"
          class="px-5 py-3 border-t border-gray-200 dark:border-gray-700/60 flex items-center justify-end gap-2"
          data-testid="modal-footer"
        >
          <slot name="footer" />
        </div>
      </div>
    </div>
  </Teleport>
</template>
