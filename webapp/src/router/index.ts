import { createRouter, createWebHistory } from 'vue-router'

// Option B routing — `/` is the Dashboard view. The entries list
// lives at `/entries`, which is mounted explicitly so deep links
// and the sidebar nav remain stable. `EntryDetailView` keeps its
// `/entries/:id` path unchanged.
const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/',
      name: 'dashboard',
      component: () => import('@/views/DashboardView.vue'),
    },
    {
      path: '/entries',
      name: 'entries',
      component: () => import('@/views/EntryListView.vue'),
    },
    {
      path: '/entries/new',
      name: 'create-entry',
      component: () => import('@/views/CreateEntryView.vue'),
    },
    {
      path: '/entries/:id',
      name: 'entry-detail',
      component: () => import('@/views/EntryDetailView.vue'),
      props: true,
    },
    {
      path: '/search',
      name: 'search',
      component: () => import('@/views/SearchView.vue'),
    },
    {
      path: '/entities',
      name: 'entities',
      component: () => import('@/views/EntityListView.vue'),
    },
    {
      path: '/entities/:id',
      name: 'entity-detail',
      component: () => import('@/views/EntityDetailView.vue'),
      props: true,
    },
    {
      path: '/jobs',
      name: 'job-history',
      component: () => import('@/views/JobHistoryView.vue'),
    },
    {
      path: '/settings',
      name: 'settings',
      component: () => import('@/views/SettingsView.vue'),
    },
  ],
})

export default router
