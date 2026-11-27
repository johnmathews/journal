# Sidebar

The app's main navigation: the logo and title at the top, then one link per page, with the current page marked in the accent.

## Use

- Every signed-in page sits beside it. The sign-in, register and password pages have no sidebar.
- One item per top-level page, in the order the app lists them: Dashboard, New Entry, Entries, Search, Conversations, Storylines, Entities, Fitness, Job History, Settings, API Keys, and Admin for admins.
- Labels are the page's name. Keep them short enough for one line at 256px.

## Anatomy

- A `panel` column, 256px wide, padded `space-4`, with `radius-xl` (16px) on its right corners and `shadow-sm`.
- At the top, the [AppLogo](../AppLogo/README.md) at 32px beside the title "JOURNAL INSIGHTS TOOL" (20px bold, `ink`). The title is the one uppercase line in the app, kept as today's look.
- Each item is a 16px icon and a `label`, padded 8px by 16px, with `radius-md` corners.

## States

- **Rest:** icon in `ink-secondary`, label in `ink`.
- **Current page:** a left-to-right wash of `accent`, 12% to 4% in light and 24% to 4% in dark, with the icon in `accent-fg`. It follows the user's accent.
- **Focus:** the 2px `focus` ring at a 2px offset (Search, in the preview).
- **Collapsed (desktop, `lg`):** 80px wide. The logo and icons stay, the title and labels fade out. Below `lg` the sidebar slides in over a `gray-900/30` backdrop and closes on a link.

## What the consumer provides

Nothing: `AppSidebar.vue` is mounted once by `DefaultLayout.vue`. It takes `sidebarOpen` and emits `close-sidebar`. A new page adds its own `RouterLink` item there, copying an existing one, including its `data-testid`.

## Do and don't

- Do mark the current page with the accent wash and nothing else.
- Don't add counts, badges or colour to items other than the current one.
- Don't recolour the logo. It is always the user's accent behind a white mark.

## Note

The current item's label is `gray-900` / white in the app, one step stronger than `ink`. The system has no token for that step, so the preview draws `ink`.
