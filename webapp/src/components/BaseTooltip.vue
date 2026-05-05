<script setup lang="ts">
/**
 * Lightweight CSS-only hover tooltip. Wraps any trigger element in its
 * default slot and renders the tooltip body in a `tooltip` slot (or via
 * the `text` prop for plain text). Visibility is driven by `:hover`
 * and `:focus-within` on the wrapper — no JS state, no portal, no
 * timers — so it remains accessible to keyboard users (the trigger
 * just needs to be focusable, which buttons and links already are).
 *
 * Position: by default the tooltip pops above the trigger and is
 * left-anchored to the trigger (the tooltip extends rightward from
 * the trigger's left edge). Pure CSS can't auto-flip near the right
 * viewport edge, so for triggers known to live near the right edge
 * pass `align="right"` to anchor the tooltip's right edge to the
 * trigger's right edge instead. Pass `placement="bottom"` to drop
 * the tooltip below.
 *
 * The trigger gets `aria-describedby` wired to the tooltip's id so
 * screen readers announce the description alongside the trigger.
 */
import { computed, useId } from 'vue'

const props = withDefaults(
  defineProps<{
    text?: string
    placement?: 'top' | 'bottom'
    /** Horizontal alignment of the tooltip relative to the trigger. */
    align?: 'left' | 'center' | 'right'
    /** Max width override; defaults to 18rem. */
    maxWidth?: string
  }>(),
  {
    text: '',
    placement: 'top',
    align: 'left',
    maxWidth: '18rem',
  },
)

const id = `tooltip-${useId()}`

// Position classes for the tooltip body relative to the trigger.
const placementClasses = computed(() => {
  if (props.placement === 'bottom') {
    return 'top-full mt-2'
  }
  return 'bottom-full mb-2'
})

const alignClasses = computed(() => {
  if (props.align === 'center') return 'left-1/2 -translate-x-1/2'
  if (props.align === 'right') return 'right-0'
  return 'left-0'
})

// Position the arrow under whichever side the tooltip is anchored to.
const arrowAlignClasses = computed(() => {
  if (props.align === 'center') return 'left-1/2 -translate-x-1/2'
  if (props.align === 'right') return 'right-3'
  return 'left-3'
})

// The little arrow notch points back at the trigger.
const arrowPlacementClasses = computed(() => {
  if (props.placement === 'bottom') {
    return 'bottom-full -mb-px border-b-gray-900 dark:border-b-gray-700'
  }
  return 'top-full -mt-px border-t-gray-900 dark:border-t-gray-700'
})
</script>

<template>
  <span class="relative inline-flex group">
    <span :aria-describedby="id"><slot /></span>
    <span
      :id="id"
      role="tooltip"
      class="pointer-events-none absolute z-30 px-2.5 py-1.5 rounded-md text-xs font-normal leading-snug text-white bg-gray-900 dark:bg-gray-700 shadow-lg ring-1 ring-black/5 dark:ring-white/10 whitespace-normal text-left opacity-0 invisible transition-opacity duration-100 group-hover:opacity-100 group-hover:visible group-focus-within:opacity-100 group-focus-within:visible"
      :class="[placementClasses, alignClasses]"
      :style="{ width: 'max-content', maxWidth }"
    >
      <slot name="tooltip">{{ text }}</slot>
      <span
        aria-hidden="true"
        class="absolute w-0 h-0 border-x-4 border-x-transparent border-y-4 border-b-transparent border-t-transparent"
        :class="[arrowAlignClasses, arrowPlacementClasses]"
      ></span>
    </span>
  </span>
</template>
