<script setup lang="ts" generic="TId extends string">
import { computed, ref } from 'vue'

interface TileDefLike {
  id: TId
  title: string
  testId?: string
  /** When false, the tile is excluded from rendering regardless of
   *  the hidden/visible state. Lets the consumer hide a tile that
   *  doesn't apply (e.g. mood-trends when scoring is disabled). */
  available?: boolean
}

interface Props {
  /**
   * All tile definitions for the page, in their canonical default
   * order. The grid filters/reorders these per `tileOrder` and
   * `hiddenTiles`.
   */
  tiles: ReadonlyArray<TileDefLike>
  /** Current display order (tile IDs). */
  tileOrder: TId[]
  /** Tile IDs the user has hidden. */
  hiddenTiles: TId[]
  /**
   * Whether edit-layout mode is on. When false, the move/hide/width
   * controls and the hidden-tiles restoration panel are not rendered.
   */
  editing: boolean
  /**
   * CSS class applied to the inner grid container. Lets each consumer
   * pick its own column count and gap (dashboard: 2-col, fitness: 6-col).
   */
  gridClass: string
  /**
   * Returns the CSS `grid-column` value (e.g. `'span 2'` or `'1 / -1'`)
   * for a given tile. The dashboard maps `1 | 2` here; the fitness page
   * maps `'third' | 'half' | 'full'`. Either way `TileGrid` itself
   * doesn't need to know how widths are represented.
   */
  getSpan: (id: TId) => string
  /** Title for the width-toggle button (e.g. `"Full width"`). */
  getWidthTitle?: (id: TId) => string
  /**
   * Prefix for testids that name the page (the grid wrapper, restore
   * panel, restore-tile buttons, reset button). Per-tile testids on
   * the move/hide/width buttons are global (`tile-move-up-{id}` etc.)
   * because tile IDs themselves are unique across the app.
   */
  testIdPrefix: string
}

const props = defineProps<Props>()

const emit = defineEmits<{
  (e: 'move', id: TId, direction: 'up' | 'down'): void
  (e: 'hide', id: TId): void
  (e: 'show', id: TId): void
  (e: 'cycle-width', id: TId): void
  (e: 'reset'): void
}>()

const tileMap = computed(() => {
  const m = new Map<TId, TileDefLike>()
  for (const t of props.tiles) m.set(t.id, t)
  return m
})

/**
 * Visible tiles in render order. We walk the canonical `tiles` list
 * to drive `v-for` (stable keys, no churn) but use each tile's
 * position in `tileOrder` to drive CSS `order:` so the visual layout
 * reflects the user's reordering.
 */
const renderable = computed(() =>
  props.tiles.filter((t) => {
    if (t.available === false) return false
    return !props.hiddenTiles.includes(t.id)
  }),
)

function orderIndex(id: TId): number {
  const idx = props.tileOrder.indexOf(id)
  // Tiles not yet in the saved order land at the end (preserves the
  // canonical order from the `tiles` array for new tiles introduced
  // after a user saved their layout).
  return idx === -1 ? props.tileOrder.length + 1 : idx
}

// Exposed so the parent can attach VueUse `useElementSize` (or any
// other element-keyed API) to a specific tile's section. Used by
// the dashboard's calendar heatmap to size its grid against the
// available tile width.
const sectionEls = ref<Partial<Record<TId, HTMLElement>>>({})

function bindSectionRef(id: TId, el: unknown): void {
  if (el instanceof HTMLElement) {
    sectionEls.value[id] = el
  } else {
    delete sectionEls.value[id]
  }
}

defineExpose({ sectionEls })

function titleFor(id: TId): string {
  return tileMap.value.get(id)?.title ?? id
}
</script>

<template>
  <div>
    <!-- Hidden tiles restoration panel (edit mode only) -->
    <div
      v-if="editing && hiddenTiles.length > 0"
      class="mb-4 bg-amber-50 dark:bg-amber-900/20 border border-dashed border-amber-300 dark:border-amber-600/50 rounded-xl px-5 py-3"
      :data-testid="`${testIdPrefix}-hidden-tiles-panel`"
    >
      <div class="flex flex-wrap items-center gap-2">
        <span
          class="text-xs font-medium text-amber-700 dark:text-amber-400 mr-1"
        >
          Hidden charts:
        </span>
        <button
          v-for="id in hiddenTiles"
          :key="id"
          type="button"
          class="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-white dark:bg-gray-700 text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-gray-600 hover:border-violet-400 dark:hover:border-violet-500 transition-colors"
          :data-testid="`${testIdPrefix}-restore-tile-${id}`"
          @click="emit('show', id)"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            class="h-3 w-3"
            viewBox="0 0 20 20"
            fill="currentColor"
          >
            <path
              fill-rule="evenodd"
              d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z"
              clip-rule="evenodd"
            />
          </svg>
          {{ titleFor(id) }}
        </button>
        <button
          type="button"
          class="ml-2 text-xs text-violet-500 hover:text-violet-600 dark:text-violet-400 dark:hover:text-violet-300 font-medium"
          :data-testid="`${testIdPrefix}-reset-layout`"
          @click="emit('reset')"
        >
          Reset all
        </button>
      </div>
    </div>

    <!-- Tiles grid -->
    <div :class="gridClass" :data-testid="`${testIdPrefix}-tiles-grid`">
      <section
        v-for="def in renderable"
        :key="def.id"
        :ref="(el) => bindSectionRef(def.id, el)"
        :style="{
          order: orderIndex(def.id),
          gridColumn: getSpan(def.id),
        }"
        class="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700/60 rounded-xl shadow-xs px-5 py-4 relative"
        :data-testid="def.testId"
      >
        <!-- Edit-mode controls overlay -->
        <div
          v-if="editing"
          class="absolute top-2 right-2 z-10 flex items-center gap-1 rounded-md bg-white/95 dark:bg-gray-800/95 px-1 py-0.5 border border-gray-200 dark:border-gray-700/60 shadow-sm"
        >
          <button
            type="button"
            class="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors"
            title="Move up"
            :data-testid="`tile-move-up-${def.id}`"
            @click="emit('move', def.id, 'up')"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              class="h-4 w-4"
              viewBox="0 0 20 20"
              fill="currentColor"
            >
              <path
                fill-rule="evenodd"
                d="M14.707 12.707a1 1 0 01-1.414 0L10 9.414l-3.293 3.293a1 1 0 01-1.414-1.414l4-4a1 1 0 011.414 0l4 4a1 1 0 010 1.414z"
                clip-rule="evenodd"
              />
            </svg>
          </button>
          <button
            type="button"
            class="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors"
            title="Move down"
            :data-testid="`tile-move-down-${def.id}`"
            @click="emit('move', def.id, 'down')"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              class="h-4 w-4"
              viewBox="0 0 20 20"
              fill="currentColor"
            >
              <path
                fill-rule="evenodd"
                d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z"
                clip-rule="evenodd"
              />
            </svg>
          </button>
          <button
            type="button"
            class="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors"
            :title="getWidthTitle ? getWidthTitle(def.id) : 'Resize'"
            :data-testid="`tile-width-${def.id}`"
            @click="emit('cycle-width', def.id)"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              class="h-4 w-4"
              viewBox="0 0 20 20"
              fill="currentColor"
            >
              <rect x="2" y="7" width="16" height="6" rx="1" />
            </svg>
          </button>
          <button
            type="button"
            class="p-1 rounded hover:bg-red-100 dark:hover:bg-red-900/30 text-gray-400 hover:text-red-500 dark:hover:text-red-400 transition-colors"
            title="Hide chart"
            :data-testid="`tile-hide-${def.id}`"
            @click="emit('hide', def.id)"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              class="h-4 w-4"
              viewBox="0 0 20 20"
              fill="currentColor"
            >
              <path
                fill-rule="evenodd"
                d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
                clip-rule="evenodd"
              />
            </svg>
          </button>
        </div>
        <slot :name="`tile-${def.id}`" :def="def" :editing="editing" />
      </section>
    </div>
  </div>
</template>
