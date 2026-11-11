import { createApp } from 'vue'
import { createPinia } from 'pinia'

import App from './App.vue'
import router from './router'
import { setUnauthorizedHandler } from '@/api/client'
import { useAuthStore } from '@/stores/auth'

import './assets/main.css'

const app = createApp(App)
const pinia = createPinia()

app.use(pinia)
app.use(router)

// Register global 401 handler. When a non-auth API call returns 401
// the session has expired — clear user state and redirect to login.
const authStore = useAuthStore()
setUnauthorizedHandler(() => {
  authStore.user = null
  router.push({ name: 'login', query: { expired: '1' } })
})

app.mount('#app')
