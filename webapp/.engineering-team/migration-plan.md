# Migration Plan: PrimeVue → Cruip Mosaic Vue (Tailwind 4)

**Date:** 2026-04-10
**Scope:** Hard cutover in a single PR. Full TypeScript port of anything retained from Mosaic. Shell + existing two views only; no new dashboard scaffolding.
**Baseline:** 28 tests passing across 7 files (`vitest run`, 944ms). Git branch `main`, clean except to-be-committed `.gitignore` and `docker-compose.yml` changes unrelated to this migration.

---

## 1. Context

The journal-webapp currently uses PrimeVue 4.5 with the Aura theme preset. Two views (`EntryListView`, `EntryDetailView`), one layout (`DefaultLayout`), no shared components, no dashboards yet. All data logic (Pinia store `entries`, api client `src/api/*`, types, composables) is PrimeVue-free and portable as-is.

Mosaic Vue is the Cruip admin dashboard template, Tailwind 4 CSS-first, ships as plain JS. We adopt the shell (Sidebar, Header chrome, layout skeleton, dark mode) and reskin the two existing views. Everything else Mosaic ships with (ecommerce, community, fintech, tasks, settings pages, chart examples, flatpickr, moment-based adapters) is deleted wholesale.

## 2. Key architecture decisions (decided before implementation)

1. **Tailwind integration: `@tailwindcss/vite`, NOT PostCSS.** This is the current official recommendation for Vue 3 + Vite per [tailwindcss.com/docs/installation/using-vite](https://tailwindcss.com/docs/installation/using-vite). Faster HMR, better source maps, no `postcss.config.cjs` needed. Mosaic's PostCSS setup is an artifact of its scaffolding, not a reason to keep that path.
2. **Tailwind config: CSS-first only.** No `tailwind.config.ts`. All tokens live in `src/assets/main.css` inside `@theme { ... }`, copied verbatim from Mosaic's `src/css/style.css`. This sidesteps the known vue-tsc type issues with `tailwindcss/types/config`.
3. **Layout abstraction: single `DefaultLayout.vue` with a `<slot/>`.** Mosaic's example pages each manually import `Sidebar` and `Header` and own their own `sidebarOpen` ref — that pattern does not suit us. We synthesize one `DefaultLayout.vue` (derived from `pages/Dashboard.vue` lines 2–14, 73–75) that owns the shell state and exposes a content slot. Router views nest inside it.
4. **Header surface: aggressively stripped.** Keep only `ThemeToggle`. Delete ModalSearch, DropdownNotifications, DropdownHelp, DropdownProfile and their imports. Rationale: single-user personal app, no auth, no notifications, no help center. Adds back later if needed.
5. **Splitter replacement in EntryDetailView: static flex 50/50, no drag-resize.** Mosaic ships no splitter; PrimeVue's drag-resize is not worth vendoring a third-party library for. If drag-resize matters later, revisit.
6. **Toast replacement: inline error banner in EntryDetailView.** Drop the global toast pattern. Show save errors as a banner above the textareas (Tailwind `bg-red-50 text-red-700` div). Drop success toasts entirely — the "modified" tag disappearing on save is sufficient feedback. Rationale: simpler, one fewer abstraction to maintain, no global provide/inject chain to replace.
7. **Icons: inline SVG.** Mosaic's shell uses only inline `<svg>` elements — no icon library. The four `primeicons` references (`pi-list`, `pi-arrow-left`, `pi-undo`, `pi-check`) are replaced with inline SVGs copied from Mosaic's existing icons or from Heroicons (MIT-licensed).
8. **Dark mode: kept.** Mosaic wires up `useDark()` from `@vueuse/core` with a `.dark` class on `<html>`. Trivial surface, nice UX win, keep it.
9. **Retain `vue-router ^5.0.4`, do not downgrade to Mosaic's 4.5.** The `<router-link v-slot="{ href, navigate, isExactActive }">` custom render API Mosaic uses in `Sidebar.vue` (lines 67–788) is stable in both 4.x and 5.x. Smoke-test the sidebar after porting; no pre-emptive downgrade.

## 3. Open risks & user decisions needed before Phase 3

1. **Cruip license + public GitHub repo.** `github.com/johnmathews/journal-webapp` is PUBLIC (confirmed via `gh repo view`). Cruip's terms at [cruip.com/terms/](https://cruip.com/terms/) permit using Mosaic in unlimited End Products but prohibit "Host, resell or re-distribute the Templates or derivatives of the Templates." The spirit of that clause is aimed at re-publishing Mosaic itself; a heavily-adapted End Product is clearly allowed. However, vendoring identifiable Mosaic files (especially the ~881-line `Sidebar.vue`) into a public repo sits in a grey zone. **Options:** (a) flip the repo to private before merge, (b) adapt the ported files enough that they're unrecognizable as Mosaic sources, (c) accept the grey zone. Recommendation: **(a) — flip to private.** It's free, takes 5 seconds, removes all ambiguity, and nothing about this project requires public visibility.
2. **vue-router 5 compatibility.** If the sidebar's `<router-link v-slot>` renders break at runtime with vue-router 5, Unit 4 gets a small delta to replace the slot pattern with the v4-ish `to` prop and computed `isActive` via `useRoute`. Not expected to be needed; flagged as a contingency.

## 4. Dependency delta

**Remove from `package.json` dependencies:**
- `@primeuix/themes`
- `primeicons`
- `primevue`

**Add to `package.json` dependencies:**
- `@vueuse/core` — used by `ThemeToggle.vue` via `useDark()`

**Add to `package.json` devDependencies:**
- `tailwindcss` (v4.x)
- `@tailwindcss/vite` (v4.x)
- `@tailwindcss/forms`

**Already present, keep unchanged:**
- `chart.js` (already at 4.5.1, newer than Mosaic's 4.4 — no breaking changes per [chartjs/Chart.js releases](https://github.com/chartjs/Chart.js/releases))
- `pinia`, `vue`, `vue-router`, `vite`, `vitest`, `typescript`, `vue-tsc`, eslint, prettier

**Explicitly NOT adding** (Mosaic has them, we don't need them):
- `flatpickr`, `vue-flatpickr-component` — no date picker
- `moment`, `chartjs-adapter-moment` — charts added later will use native Date/Temporal
- `postcss`, `@tailwindcss/postcss` — using the Vite plugin instead

## 5. Work units

Units run **sequentially** unless noted otherwise. Each unit ends at a green build, even when the visual output is broken. Every unit must leave `npm run build` passing even if tests are red.

### Unit 0 — Pre-flight (no code changes)

- Confirm `git -C journal-webapp status` is clean or the existing uncommitted changes are unrelated and can be stashed.
- Confirm `npm run test:unit` = 28/28 green (already verified in planning).
- Confirm `npm run build` green (vue-tsc + Vite production build).
- Create the feature branch: `git -C journal-webapp checkout -b mosaic-migration`.

**Acceptance:** clean branch, baseline recorded.

### Unit 1 — Dependency swap

- Edit `package.json`:
  - Remove `@primeuix/themes`, `primeicons`, `primevue` from `dependencies`.
  - Add `@vueuse/core` to `dependencies`.
  - Add `tailwindcss`, `@tailwindcss/vite`, `@tailwindcss/forms` to `devDependencies`.
- `npm install`
- Commit: "Replace PrimeVue deps with Tailwind 4 + Mosaic dependencies"

**Acceptance:** `npm install` succeeds, no lockfile warnings, `package-lock.json` updated. Tests and build will fail after this unit — expected.

### Unit 2 — Vite + Tailwind wiring

- Edit `vite.config.ts`: import and register `@tailwindcss/vite` as a Vite plugin alongside `@vitejs/plugin-vue`. Preserve the `/api` dev proxy to `localhost:8400` verbatim.
- Create `src/assets/main.css` containing:
  ```css
  @import "tailwindcss";
  @plugin "@tailwindcss/forms" { strategy: base; }
  @custom-variant dark (&:is(.dark *));
  @custom-variant sidebar-expanded (&:is(.sidebar-expanded *));
  @theme {
    /* copy verbatim from mosaic-vue/src/css/style.css @theme block:
       --color-gray-*, --color-violet-*, --color-sky-*, --color-green-*,
       --color-red-*, --color-yellow-*, --font-inter, full type scale,
       --breakpoint-xs: 480px, --shadow-sm */
  }
  ```
- Create `src/assets/utility-patterns.css` as a verbatim copy of `mosaic-vue/src/css/additional-styles/utility-patterns.css` (the `.btn`, `.btn-sm`, `.btn-lg`, `.form-input`, `.form-select`, etc. component classes).
- Import `utility-patterns.css` from `main.css` via `@import "./utility-patterns.css" layer(components);`.
- Commit: "Add Tailwind 4 via Vite plugin with Mosaic design tokens"

**Acceptance:** `npm run dev` starts, `main.css` is served, Tailwind utility classes work on a test element. Views are visually broken but not runtime-broken.

### Unit 3 — Strip PrimeVue from `main.ts` and `App.vue`

- Edit `src/main.ts`:
  - Remove imports: `PrimeVue from 'primevue/config'`, `Aura from '@primeuix/themes/aura'`, `ToastService from 'primevue/toastservice'`, `'primeicons/primeicons.css'`.
  - Remove the `app.use(PrimeVue, { ... })` and `app.use(ToastService)` calls.
  - Add `import './assets/main.css'` at the top.
  - Keep `createApp`, `createPinia`, `router`, `app.mount`.
- Edit `src/App.vue`: if it currently wraps `RouterView` in a PrimeVue provider, strip that. Keep the `<RouterView />`.
- Edit `index.html`: add the Mosaic body inline script verbatim that seeds `sidebar-expanded` from `localStorage` before Vue mounts. Place it as a regular `<script>` in `<head>` so it runs before body paint.
- Commit: "Remove PrimeVue bootstrap, add Tailwind CSS entry"

**Acceptance:** `npm run build` succeeds (type-check + bundle). App serves; no PrimeVue imports anywhere. Views render as naked HTML with Tailwind forms reset — ugly but functional.

### Unit 4 — Port Mosaic shell to TypeScript

All shell files go under `src/layouts/` or `src/components/layout/`.

**Files to port (TypeScript, `<script setup lang="ts">`):**

| Mosaic path | New path | Notes |
|---|---|---|
| `src/partials/Sidebar.vue` | `src/components/layout/Sidebar.vue` | Type `sidebarOpen: boolean`, emits `close-sidebar`. Strip every nav link that targets Mosaic's deleted pages. Replace the nav items with a single "Entries" link pointing at `{ name: 'entries' }`. Keep the collapse/expand logic, localStorage persistence, and body-class toggle verbatim. Replace `ref(null)` with `ref<HTMLDivElement \| null>(null)` + null guards in handlers. |
| `src/partials/SidebarLinkGroup.vue` | `src/components/layout/SidebarLinkGroup.vue` | `defineProps<{ activeCondition?: boolean }>()`, `ref<boolean>(props.activeCondition ?? false)`. Keep only because future nav groups may need it. |
| `src/partials/Header.vue` | `src/components/layout/Header.vue` | Strip imports and template blocks for ModalSearch, DropdownNotifications, DropdownHelp, DropdownProfile. Keep only the hamburger button + `<ThemeToggle>`. Type `sidebarOpen: boolean`, emits `toggle-sidebar`. |
| `src/components/ThemeToggle.vue` | `src/components/layout/ThemeToggle.vue` | Port to TS. `useDark()` returns `Ref<boolean>`. No null issues. |
| `src/utils/Utils.js` | `src/utils/mosaic.ts` | Only export `getCssVariable` and `adjustColorOpacity` — they're the two functions ChartjsConfig needs. Delete `formatValue`, `formatThousands`, `oklchToRGBA` unless smoke tests show they're transitively required. |
| `src/charts/ChartjsConfig.js` | `src/utils/chartjs-config.ts` | Port to TS with explicit types. Export `chartAreaGradient(ctx: CanvasRenderingContext2D, chartArea: { top: number; bottom: number }, colorStops: { stop: number; color: string }[])`. |

**New file:**

`src/layouts/DefaultLayout.vue` — the shell wrapper. Structure:

```vue
<script setup lang="ts">
import { ref } from 'vue'
import Sidebar from '@/components/layout/Sidebar.vue'
import Header from '@/components/layout/Header.vue'

const sidebarOpen = ref(false)
</script>

<template>
  <div class="flex h-[100dvh] overflow-hidden">
    <Sidebar :sidebar-open="sidebarOpen" @close-sidebar="sidebarOpen = false" />
    <div class="relative flex flex-col flex-1 overflow-y-auto overflow-x-hidden">
      <Header :sidebar-open="sidebarOpen" @toggle-sidebar="sidebarOpen = !sidebarOpen" />
      <main class="grow">
        <div class="px-4 sm:px-6 lg:px-8 py-8 w-full max-w-[96rem] mx-auto">
          <slot />
        </div>
      </main>
    </div>
  </div>
</template>
```

**Delete from journal-webapp:** the existing `src/layouts/DefaultLayout.vue` (will be replaced above).

**Do NOT copy from Mosaic:** `ModalSearch.vue`, `DropdownNotifications.vue`, `DropdownHelp.vue`, `DropdownProfile.vue`, `Notification.vue`, `Toast*.vue`, all chart components except `ChartjsConfig`, any image except `user-avatar-32.png` (and we're skipping DropdownProfile so we don't even need that).

**Router wiring:** Edit `src/router/index.ts` so that both routes render inside `DefaultLayout`. Two equivalent options — pick whichever is cleaner:

- **Option A (preferred):** wrap `<RouterView>` in `App.vue` with `<DefaultLayout>`. Simpler, one layout for all routes, fine because there are only two routes.
- **Option B:** use nested routes with a layout parent component.

Commit: "Port Mosaic shell (Sidebar, Header, DefaultLayout) to TypeScript"

**Acceptance:** `npm run build` green, `npm run dev` shows the Mosaic sidebar and header rendering around the old (still PrimeVue-broken) views. Clicking the sidebar hamburger toggles the sidebar. Dark mode toggle works and persists via localStorage. Single nav link points at `/` and highlights when active.

### Unit 5 — Rewrite `EntryListView.vue`

This is the largest view rewrite. Logic is preserved verbatim — the only changes are template and scoped-style.

**Keep unchanged:**
- All imports from `@/stores/entries`, `@/types/entry`, `vue-router`
- All refs, computed, lifecycle hooks, handlers (`onPage`, `onSort`, `onRowClick`, `formatDate`, `formatDateTime`, the error/empty state logic)

**Replace imports:**
- Remove `import DataTable, { type DataTablePageEvent } from 'primevue/datatable'`
- Remove `import Column from 'primevue/column'`
- Define a local `interface PageEvent { first: number; rows: number }` to replace `DataTablePageEvent`

**Template rewrite:**
- Native `<table class="table-auto w-full">` with `<thead>` / `<tbody>`
- Columns: Date, Time, Pages, Words, Preview (match the current DataTable columns in whatever order they currently appear — read EntryListView.vue during implementation)
- Row click: `@click="onRowClick({ data: entry })"`
- Hover state: `<tr class="hover:bg-gray-50 dark:hover:bg-gray-700/20 cursor-pointer">`
- Sortable headers: `<th>` with a click handler that calls `onSort({ sortField, sortOrder })`. Include a sort indicator SVG.
- Loading state: a centered spinner (inline SVG) during `store.loading`
- Empty state: a Tailwind card with "No entries yet" message
- Error state: `bg-red-50 text-red-700` banner above the table
- Pagination controls below the table: hand-rolled Previous / Page X of Y / Next buttons that call `onPage({ first, rows })`. Use Mosaic's `.btn .btn-sm` utility classes.

**Delete:** the entire `<style scoped>` block — all styling moves to Tailwind utilities.

Commit: "Rewrite EntryListView with Tailwind table and hand-rolled pagination"

**Acceptance:** `npm run dev` — the list view renders, loads data from the backend (requires journal-server running), rows are clickable and navigate to the detail view, pagination controls work, sort headers work, loading and error states render correctly. Existing `EntryListView.test.ts` will be red — that's Unit 7.

### Unit 6 — Rewrite `EntryDetailView.vue`

**Keep unchanged:**
- All imports from `@/stores/entries`, `@/composables/useEntryEditor`, `vue-router`, `vue`
- The composable destructure (`editedText`, `saving`, `saveError`, `isDirty`, `isModified`, `reset`)
- The `save()`, `goBack()`, `formatDate()` functions (with the `useToast` calls inside `save()` removed — see below)
- The `onBeforeRouteLeave` guard and `beforeunload` handler
- The `onMounted` / `watch` for loading the entry

**Replace imports:**
- Remove `import Splitter from 'primevue/splitter'`, `import SplitterPanel from 'primevue/splitterpanel'`
- Remove `import Textarea from 'primevue/textarea'`
- Remove `import Button from 'primevue/button'`
- Remove `import Tag from 'primevue/tag'`
- Remove `import Toast from 'primevue/toast'`
- Remove `import { useToast } from 'primevue/usetoast'`
- Remove the `const toast = useToast()` line

**`save()` function changes:** replace both `toast.add(...)` calls with:
- On success: do nothing (the disappearing "Modified" tag is the signal).
- On failure: `saveError.value` is already being set by the existing code path; the inline error banner in the template surfaces it. If the current code has a separate `toast.add` for failure, remove it — the banner handles it.

**Template rewrite:**
- Remove `<Toast />`
- Replace `<Splitter>` + two `<SplitterPanel>` with `<div class="flex gap-4 h-full">` + two `<div class="flex-1">`
- Replace both `<Textarea v-model="...">` with native `<textarea class="form-textarea w-full h-full" v-model="...">` (uses `form-textarea` from @tailwindcss/forms base strategy + utility-patterns.css)
- Replace every `<Button>`:
  - Back: `<button class="btn bg-white border-gray-200 text-gray-600 hover:text-gray-800" @click="goBack"><svg>...</svg> Back</button>`
  - Reset: `<button class="btn bg-white border-gray-200" :disabled="!isDirty" @click="reset"><svg>undo</svg> Reset</button>`
  - Save: `<button class="btn bg-indigo-500 hover:bg-indigo-600 text-white" :disabled="saving || !isDirty" @click="save">{{ saving ? 'Saving...' : 'Save' }}</button>`
  - Replace `pi-arrow-left`, `pi-undo`, `pi-check` with inline SVGs (copy from Heroicons 24/outline: `arrow-left`, `arrow-uturn-left`, `check`).
- Replace `<Tag severity="warn">Modified</Tag>` with `<span v-if="isModified" class="inline-flex text-xs font-medium bg-yellow-100 text-yellow-700 rounded-full px-2.5 py-0.5">Modified</span>`
- Add error banner: `<div v-if="saveError" class="mb-4 bg-red-50 text-red-700 p-3 rounded border border-red-200">{{ saveError }}</div>`
- Delete the entire `<style scoped>` block.

Commit: "Rewrite EntryDetailView with Tailwind, inline save error banner"

**Acceptance:** detail view loads, displays OCR and editable text side-by-side (static 50/50), save works, reset works, back works, the "Modified" badge appears when edited, save errors surface as an inline banner, the beforeunload/route guard still fire on unsaved changes.

### Unit 7 — Update tests

**Files to edit:**
- `src/views/__tests__/EntryListView.test.ts`
- `src/views/__tests__/EntryDetailView.test.ts`

**Changes:**
- Remove `import PrimeVue from 'primevue/config'`, `import Aura from '@primeuix/themes/aura'`, `import ToastService from 'primevue/toastservice'` from both test files.
- Remove the PrimeVue/Aura/ToastService entries from the `global.plugins` array in `mountComponent`.
- Review every selector:
  - Selectors on wrapper classes that the views own (`.entry-detail`, `.detail-header`, `.loading`, `.entry-count`, `h2`) — may need updating because those classes probably disappear when the scoped CSS is deleted. Replace with selectors on stable elements (e.g., data-testid attributes, or structural selectors like `[role="table"]`, `main h1`).
  - If any test currently queries PrimeVue internal DOM (`.p-datatable-tbody`, `.p-button`, `.p-toast-message`) — replace with native selectors.
- Consider adding `data-testid="..."` attributes to the rewritten views for test stability. Specifically: `data-testid="entry-row"`, `data-testid="save-button"`, `data-testid="error-banner"`, `data-testid="modified-tag"`.

**Run:** `npm run test:unit` must show 28/28 green before commit.

Commit: "Update view tests for Tailwind-based shell"

**Acceptance:** 28/28 tests pass. No PrimeVue imports remain anywhere in `src/`.

### Unit 8 — Documentation + journal

**Files to update:**
- `docs/architecture.md` — replace any mention of "PrimeVue Aura theme" with "Tailwind 4 + Mosaic-derived shell". Update the tech stack section.
- `docs/future-features.md` lines 22–27 — replace "PrimeVue Chart component" with "Chart.js 4 via `src/utils/chartjs-config.ts`" for the planned dashboards.
- `CLAUDE.md` (journal-webapp) — update the Tech Stack section: remove PrimeVue 4.5, primeicons, add Tailwind 4, @tailwindcss/vite, @tailwindcss/forms, @vueuse/core.
- `README.md` — if it mentions the stack, update.

**New file:** `journal/260410-mosaic-migration.md` documenting:
- Why (design quality goal; PrimeVue's default look was too plain)
- Architecture decisions from Section 2 above
- License decision (private repo flip if taken; otherwise the grey-zone acceptance rationale)
- The useToast/Splitter simplifications and why
- Before/after test counts
- Follow-up items: dashboards, drag-resize splitter (if wanted), search modal (if wanted)

Commit: "Document Mosaic migration in docs and journal"

**Acceptance:** docs accurately reflect the new stack. No stale PrimeVue references anywhere in `docs/` or `CLAUDE.md` (grep to confirm).

### Unit 9 — Final verification

- `npm run build` — green, production bundle.
- `npm run test:unit` — 28/28.
- `npm run lint` — clean.
- `npm run format` — no diff.
- **Visual verification with Playwright** (required by the skill for UI work):
  - Start journal-server (`cd journal-server && uv run journal serve` or equivalent; check its CLAUDE.md for the canonical command).
  - Start journal-webapp (`npm run dev`).
  - Navigate to `http://localhost:5173`.
  - Screenshot the list view. Verify: sidebar renders, header renders, table shows entries, pagination controls present.
  - Click an entry row. Screenshot the detail view. Verify: two-pane layout, OCR text read-only, editable text with `form-textarea` styling, Save/Reset/Back buttons visible.
  - Click the theme toggle. Screenshot both states.
  - Resize the browser to mobile width. Verify: sidebar collapses appropriately.
  - Check `browser_console_messages` — no errors.
  - Check `browser_network_requests` — `/api/entries` 200 OK.
- `git -C journal-webapp log --oneline main..HEAD` — clean commit sequence.

**Acceptance:** everything green, screenshots saved to `.engineering-team/migration-screenshots/` for the journal entry.

### Unit 10 — Merge and push

- If license decision was "flip repo to private": `gh repo edit johnmathews/journal-webapp --visibility private --accept-visibility-change-consequences` BEFORE merging.
- Run `/done` skill for final quality gate.
- Run `/merge-push` skill for merge + push.
- Do NOT push until the license decision is resolved either way.

## 6. File manifest summary

### To delete (in journal-webapp)
- `src/layouts/DefaultLayout.vue` (old version; replaced in Unit 4)

### To create
- `src/assets/main.css`
- `src/assets/utility-patterns.css`
- `src/components/layout/Sidebar.vue`
- `src/components/layout/Header.vue`
- `src/components/layout/SidebarLinkGroup.vue`
- `src/components/layout/ThemeToggle.vue`
- `src/layouts/DefaultLayout.vue` (new, Mosaic-derived shell)
- `src/utils/mosaic.ts`
- `src/utils/chartjs-config.ts`
- `journal/260410-mosaic-migration.md`

### To edit
- `package.json` — dependency swap
- `package-lock.json` — auto-regenerated
- `vite.config.ts` — add `@tailwindcss/vite` plugin
- `index.html` — add sidebar-expanded localStorage seed script
- `src/main.ts` — strip PrimeVue, import main.css
- `src/App.vue` — wrap RouterView in DefaultLayout
- `src/router/index.ts` — possible nested-route change (decided in Unit 4)
- `src/views/EntryListView.vue` — full template/style rewrite, logic preserved
- `src/views/EntryDetailView.vue` — full template/style rewrite, logic preserved
- `src/views/__tests__/EntryListView.test.ts` — plugin and selector updates
- `src/views/__tests__/EntryDetailView.test.ts` — plugin and selector updates
- `docs/architecture.md`, `docs/future-features.md`, `CLAUDE.md`, `README.md`

### To keep untouched
- `src/api/client.ts`, `src/api/entries.ts`, `src/api/__tests__/*`
- `src/stores/entries.ts`, `src/stores/__tests__/*`
- `src/types/entry.ts`
- `src/composables/useEntryEditor.ts`, `src/composables/__tests__/*`
- `Dockerfile`, `nginx.conf`, `docker-compose.yml`, `.github/workflows/*`
- `tsconfig.json`, `tsconfig.node.json`, `env.d.ts`, `eslint.config.js`, `vitest.config.ts`

## 7. Test strategy

- **Baseline:** 28 tests passing before any changes.
- **Expected during migration:** tests go red after Unit 1 (imports fail), stay red through Unit 6, return to green at Unit 7.
- **Post-migration target:** 28 tests passing. No new tests required because the logic under test hasn't changed — only the presentation layer has.
- **Coverage goal:** unchanged from baseline. The composable, store, and api client are the highest-value covered code; they're untouched.
- **Future tests (out of scope for this PR):** visual regression tests (Playwright snapshots) and a new test for the inline save-error banner. Noted in the journal entry as follow-up.

## 8. What this plan does NOT do

- Does not scaffold any dashboards (per user decision: "Shell + existing 2 views only").
- Does not add drag-resize to the detail view splitter (accepted static 50/50).
- Does not build a search modal (stripped from Header in Unit 4).
- Does not add authentication / profile dropdown (no users to log in).
- Does not introduce a visual regression testing framework.
- Does not change any backend code. The journal-server API contract is unchanged.
- Does not change Docker / nginx / CI — those were verified PrimeVue-free.
