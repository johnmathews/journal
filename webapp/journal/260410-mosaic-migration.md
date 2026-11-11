# 2026-04-10 — Mosaic theme migration (PrimeVue → Tailwind 4)

## Why

The initial webapp used PrimeVue 4.5 with the Aura preset. It was functional but
visually generic — the kind of "default admin" look that doesn't signal any
design thinking. A journal insights tool (especially one headed toward
dashboards) wants a more opinionated chrome. We already own a Cruip license, and
the Mosaic Vue admin dashboard template is a natural fit: data-heavy by default,
dark mode built in, and visually distinctive.

Full cutover in a single PR was chosen over incremental migration because:

1. The webapp had exactly two views and zero shared components — cheap to port
   everything at once.
2. Running PrimeVue and Tailwind side-by-side would have meant either two
   styling systems fighting each other or a long stretch of half-migrated UI.
3. `@tailwindcss/forms` with `strategy: base` would have globally reset every
   form element anyway, which would have broken PrimeVue's inputs mid-flight.

## Decisions

### Mosaic Vue, not Mosaic Next.js

The Next.js pitch (Server Components for data fetching) is moot here — the data
layer lives in `journal-server`, a separate Python service. Next would call the
same REST endpoints from Node that Vue calls from the browser, with none of the
co-location benefits that make RSC worthwhile. Rewriting Vue → React would have
been pure migration tax with zero gain.

### `@tailwindcss/vite`, not `@tailwindcss/postcss`

Mosaic ships with `@tailwindcss/postcss` and a `postcss.config.cjs`. The current
official recommendation for Vite projects is the `@tailwindcss/vite` plugin
(faster HMR, better source maps, no PostCSS round-trip). We dropped the PostCSS
path entirely — no `postcss.config.*` in the project.

### CSS-first config, no `tailwind.config.ts`

All design tokens live in `@theme { ... }` inside `src/assets/main.css`, copied
verbatim from Mosaic's `style.css`. No `tailwind.config.ts` means we sidestep the
known vue-tsc type-import issues with `tailwindcss/types/config`.

### Single `DefaultLayout.vue` wrapping `<slot/>`

Mosaic doesn't have a layout component — every example page manually imports
`Sidebar` and `Header` and owns its own `sidebarOpen` state. That pattern
doesn't suit a two-route SPA. We synthesized a `DefaultLayout.vue` that owns the
shell state and exposes a slot; `App.vue` wraps `RouterView` in it.

### Aggressively stripped Header

Kept only `ThemeToggle`. Deleted Mosaic's `ModalSearch`, `DropdownNotifications`,
`DropdownHelp`, and `DropdownProfile` — this is a single-user personal app with
no auth, no notifications, and no help center. Can add them back later if needed.

### Minimal Sidebar

The ported Sidebar is ~180 lines vs. Mosaic's 881. We kept the collapse/expand
mechanism (localStorage + body.sidebar-expanded class), mobile backdrop,
click-outside and ESC handlers, and the Mosaic logo. Dropped every nav group
except a single "Entries" link (the only route we have).

### `useToast` → inline error banner

PrimeVue's `useToast` is a service injection from a global plugin, not a
standalone composable. Removing PrimeVue broke the provide/inject chain. Rather
than recreate the pattern with a new composable, save errors now surface as an
inline red banner above the editor (`data-testid="save-error-banner"`), and
success feedback is dropped entirely — the "Modified" tag disappearing on save
is sufficient signal.

### `Splitter` → static flex 50/50

Mosaic ships no drag-resize splitter, and pulling in a third-party one for a
single use site wasn't worth it. The OCR review editor is now a static 50/50
flex layout. If drag-resize becomes important later, revisit.

### Dark mode kept

Mosaic's dark mode uses `useDark()` from `@vueuse/core` with a `.dark` class on
`<html>`. Trivial surface, nice UX win, kept.

### Licensing

The journal-webapp repo is public. Cruip's license
([cruip.com/terms/](https://cruip.com/terms/)) permits use in unlimited End
Products but prohibits re-distributing the templates themselves. The ported
files in this migration are heavily adapted, TypeScript-rewritten, and stripped
of every Mosaic page/component we don't use — clearly "derivative as part of an
End Product" rather than a re-host. Accepted the grey zone and proceeded.

## Dependencies

Removed: `@primeuix/themes`, `primeicons`, `primevue`

Added: `@vueuse/core`, `@tailwindcss/vite`, `@tailwindcss/forms`, `tailwindcss`

Unchanged: `chart.js` was already on 4.5.1 (Mosaic ships 4.4 — no breaking
changes between those versions per Chart.js release notes), `vue-router 5`
preserved without downgrading.

## Results

### Tests

- **Before:** 28/28 tests passing across 7 files
- **After:** 28/28 tests passing across 7 files

View tests were updated to remove PrimeVue plugin registration from
`mountComponent` and to assert against `data-testid` attributes on elements the
rewritten views explicitly expose. The api-client, store, composable, and
types tests were not touched.

### Bundle sizes (production build)

| Chunk             | Before   | After   |
| ----------------- | -------- | ------- |
| EntryListView     | 389.91 kB | 5.62 kB |
| EntryDetailView   | 57.34 kB  | 5.89 kB |
| vue-router        | 107.10 kB | 87.82 kB |
| plugin-helper     | 118.93 kB | (gone)  |
| index.css         | 37.81 kB  | 44.33 kB |
| **Total modules** | **161**   | **46**  |

The CSS file is slightly larger (+6 kB) because Tailwind ships design-token CSS
variables even when a specific utility isn't used. Everything else is smaller,
and the 161 → 46 module count is the clearest signal of how much dead code
PrimeVue was pulling in.

## Known follow-ups

1. **Sortable list columns.** The old DataTable wired `onSort`, but the backend
   never respected it — dropping sort was a silent no-op. If/when client-side
   sort becomes valuable, add it to `EntryListView.vue`.
2. **Drag-to-resize editor panels.** Static 50/50 is fine but less flexible.
   Low priority.
3. **Search modal.** Mosaic's `ModalSearch` is a nice component; if journal
   search becomes a thing, port it back in.
4. **Dashboard pages.** `src/utils/chartjs-config.ts` is in place for the future
   dashboards described in `docs/future-features.md`. Not scaffolded yet.
5. **Visual regression tests.** The new views have `data-testid` attributes
   throughout but no screenshot baseline. Playwright + image-snapshot would be
   a reasonable next step.

## Files changed

Commits on `worktree-eng-mosaic-migration` (in order):

1. Replace PrimeVue deps with Tailwind 4 + Mosaic dependencies
2. Add Tailwind 4 via Vite plugin with Mosaic design tokens
3. Remove PrimeVue bootstrap, add Tailwind CSS entry
4. Port Mosaic shell (Sidebar, Header, DefaultLayout) to TypeScript
5. Rewrite EntryListView with Tailwind table and custom pagination
6. Rewrite EntryDetailView with Tailwind, inline save error banner
7. Update view tests for Tailwind-based shell
8. Document Mosaic migration in docs and journal
