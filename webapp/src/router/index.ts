import { createRouter, createWebHistory } from 'vue-router'
import { useAuthStore } from '@/stores/auth'

// Option B routing — `/` is the Dashboard view. The entries list
// lives at `/entries`, which is mounted explicitly so deep links
// and the sidebar nav remain stable. `EntryDetailView` keeps its
// `/entries/:id` path unchanged.
const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    // ---------- Public (auth) routes ----------
    {
      path: '/login',
      name: 'login',
      component: () => import('@/views/LoginView.vue'),
      meta: { public: true },
    },
    {
      path: '/register',
      name: 'register',
      component: () => import('@/views/RegisterView.vue'),
      meta: { public: true },
    },
    {
      path: '/forgot-password',
      name: 'forgot-password',
      component: () => import('@/views/ForgotPasswordView.vue'),
      meta: { public: true },
    },
    {
      path: '/reset-password',
      name: 'reset-password',
      component: () => import('@/views/ResetPasswordView.vue'),
      meta: { public: true },
    },
    {
      path: '/verify-email',
      name: 'verify-email',
      component: () => import('@/views/VerifyEmailView.vue'),
      meta: { public: true },
    },

    // ---------- Authenticated routes ----------
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
      path: '/insights',
      redirect: '/',
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
    {
      path: '/api-keys',
      name: 'api-keys',
      component: () => import('@/views/ApiKeysView.vue'),
    },

    // ---------- Admin routes ----------
    {
      path: '/admin',
      component: () => import('@/views/admin/AdminLayout.vue'),
      meta: { requiresAdmin: true },
      children: [
        {
          path: '',
          name: 'admin-overview',
          component: () => import('@/views/admin/AdminOverview.vue'),
        },
        {
          path: 'users',
          name: 'admin-users',
          component: () => import('@/views/admin/AdminDashboard.vue'),
        },
        {
          path: 'runtime',
          name: 'admin-runtime',
          component: () => import('@/views/admin/AdminRuntimeView.vue'),
        },
        {
          path: 'pricing',
          name: 'admin-pricing',
          component: () => import('@/views/admin/AdminPricingView.vue'),
        },
        {
          path: 'server',
          name: 'admin-server',
          component: () => import('@/views/admin/AdminServerView.vue'),
        },
        {
          path: 'moods',
          name: 'admin-moods',
          component: () => import('@/views/admin/AdminMoodsView.vue'),
        },
      ],
    },
  ],
})

// ---------- Global navigation guard ----------
router.beforeEach(async (to) => {
  const authStore = useAuthStore()

  // Wait for the initial auth check to complete
  if (!authStore.initialized) {
    await authStore.initialize()
  }

  const isPublic = to.meta.public === true
  const requiresAdmin = to.meta.requiresAdmin === true

  // Redirect authenticated users away from login/register,
  // but allow access to /verify-email (users are authenticated
  // via session cookie from registration when they click the link)
  if (isPublic && authStore.isAuthenticated && to.name !== 'verify-email') {
    return { name: 'dashboard' }
  }

  // Redirect unauthenticated users to login
  if (!isPublic && !authStore.isAuthenticated) {
    return { name: 'login', query: { redirect: to.fullPath } }
  }

  // Block non-admin users from admin routes
  if (requiresAdmin && !authStore.isAdmin) {
    return { name: 'dashboard' }
  }
})

export default router
