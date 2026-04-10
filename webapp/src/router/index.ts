import { createRouter, createWebHistory } from 'vue-router'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/',
      name: 'entries',
      component: () => import('@/views/EntryListView.vue'),
    },
    {
      path: '/entries/:id',
      name: 'entry-detail',
      component: () => import('@/views/EntryDetailView.vue'),
      props: true,
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
  ],
})

export default router
