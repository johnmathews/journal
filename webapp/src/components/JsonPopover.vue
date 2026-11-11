<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount, nextTick } from 'vue'

const props = defineProps<{
  /** Either a plain string (rendered verbatim) or any value (rendered as JSON). */
  content: unknown
  /** Heading shown at the top of the popover. */
  title?: string
  /** Trigger button label. Defaults to "details". */
  triggerLabel?: string
  /** Extra classes to style the trigger. */
  triggerClass?: string
}>()

const open = ref(false)
const trigger = ref<HTMLElement | null>(null)
const panel = ref<HTMLElement | null>(null)
const panelStyle = ref<Record<string, string>>({})

function positionPanel() {
  if (!trigger.value || !panel.value) return
  const rect = trigger.value.getBoundingClientRect()
  const panelWidth = panel.value.offsetWidth
  const viewportWidth = document.documentElement.clientWidth
  // Right-align the panel to the trigger, but keep it on-screen.
  let right = Math.max(8, viewportWidth - rect.right)
  if (rect.right - panelWidth < 8) {
    right = Math.max(8, viewportWidth - (rect.left + panelWidth))
  }
  panelStyle.value = {
    position: 'fixed',
    top: `${rect.bottom + 4}px`,
    right: `${right}px`,
  }
}

async function toggle(e: MouseEvent) {
  e.stopPropagation()
  open.value = !open.value
  if (open.value) {
    await nextTick()
    positionPanel()
  }
}
function close() {
  open.value = false
}

function onDocumentMouseDown(e: MouseEvent) {
  if (!open.value) return
  const target = e.target as Node
  if (trigger.value?.contains(target) || panel.value?.contains(target)) {
    return
  }
  close()
}
function onKey(e: KeyboardEvent) {
  if (e.key === 'Escape') close()
}
function onScrollOrResize() {
  if (!open.value) return
  positionPanel()
}

onMounted(() => {
  document.addEventListener('mousedown', onDocumentMouseDown)
  document.addEventListener('keydown', onKey)
  window.addEventListener('scroll', onScrollOrResize, true)
  window.addEventListener('resize', onScrollOrResize)
})
onBeforeUnmount(() => {
  document.removeEventListener('mousedown', onDocumentMouseDown)
  document.removeEventListener('keydown', onKey)
  window.removeEventListener('scroll', onScrollOrResize, true)
  window.removeEventListener('resize', onScrollOrResize)
})

const formatted = computed<string>(() => {
  if (typeof props.content === 'string') return props.content
  try {
    return JSON.stringify(props.content, null, 2)
  } catch {
    return String(props.content)
  }
})
</script>

<template>
  <span class="inline-block">
    <button
      ref="trigger"
      type="button"
      class="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium border border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400 hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-gray-700/50 dark:hover:text-gray-200 transition-colors"
      :class="triggerClass"
      data-testid="json-popover-trigger"
      :aria-expanded="open"
      @click="toggle"
    >
      {{ triggerLabel ?? 'details' }}
    </button>
    <Teleport v-if="open" to="body">
      <div
        ref="panel"
        :style="panelStyle"
        class="z-50 min-w-[18rem] max-w-md max-h-80 overflow-auto rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 shadow-lg p-3"
        data-testid="json-popover-panel"
        role="dialog"
      >
        <div
          v-if="title"
          class="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1.5 uppercase tracking-wider"
        >
          {{ title }}
        </div>
        <pre
          class="text-xs text-gray-700 dark:text-gray-200 whitespace-pre-wrap break-words font-mono leading-relaxed"
          >{{ formatted }}</pre
        >
      </div>
    </Teleport>
  </span>
</template>
