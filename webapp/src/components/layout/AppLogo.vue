<script setup lang="ts">
// Journal's mark: a ruled page with a pen writing its last line, white on a tile in the user's
// accent colour (accent-500, so it recolours with Settings → Appearance). Drawn from
// src/brand/app-icon.json, the same source scripts/app-icon.mjs builds the favicon sets from, so
// the logo and the tab icon always match (brand/design-system/mockups/261126-app-icon).
import icon from '@/brand/app-icon.json'
</script>

<template>
  <svg
    viewBox="0 0 32 32"
    xmlns="http://www.w3.org/2000/svg"
    aria-hidden="true"
    data-testid="app-logo"
  >
    <rect
      width="32"
      height="32"
      :rx="icon.radius"
      class="fill-accent-500"
      data-testid="app-logo-tile"
    />
    <rect
      :x="icon.page.x"
      :y="icon.page.y"
      :width="icon.page.width"
      :height="icon.page.height"
      :rx="icon.page.rx"
      fill="none"
      :stroke="icon.glyph"
      :stroke-width="icon.page.stroke"
      stroke-linecap="round"
      stroke-linejoin="round"
    />
    <path
      :d="icon.lines.d"
      fill="none"
      :stroke="icon.glyph"
      :stroke-width="icon.lines.stroke"
      stroke-linecap="round"
      stroke-linejoin="round"
    />
    <g :transform="icon.pen.transform">
      <path
        :d="icon.pen.body"
        :fill="icon.glyph"
        class="stroke-accent-500"
        :stroke-width="icon.pen.knockout"
        stroke-linejoin="round"
        paint-order="stroke"
      />
      <path
        :d="icon.pen.bands"
        fill="none"
        class="stroke-accent-500"
        :stroke-width="icon.pen.bandStroke"
      />
    </g>
  </svg>
</template>
