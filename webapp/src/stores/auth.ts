import { ref, computed } from 'vue'
import { defineStore } from 'pinia'
import { apiFetch, ApiRequestError } from '@/api/client'

export interface AuthUser {
  id: number
  email: string
  display_name: string
  is_admin: boolean
  is_active: boolean
  email_verified: boolean
  created_at: string
  updated_at: string
}

export interface LoginCredentials {
  email: string
  password: string
}

export interface RegisterData {
  email: string
  password: string
  display_name: string
}

export const useAuthStore = defineStore('auth', () => {
  const user = ref<AuthUser | null>(null)
  const initialized = ref(false)
  const loading = ref(false)
  const error = ref<string | null>(null)

  const isAuthenticated = computed(() => user.value !== null)
  const isAdmin = computed(() => user.value?.is_admin ?? false)
  const displayName = computed(() => user.value?.display_name ?? '')
  const emailVerified = computed(() => user.value?.email_verified ?? false)

  async function initialize(): Promise<void> {
    if (initialized.value) return
    try {
      user.value = await apiFetch<AuthUser>('/api/auth/me')
    } catch {
      user.value = null
    } finally {
      initialized.value = true
    }
  }

  async function login(credentials: LoginCredentials): Promise<void> {
    loading.value = true
    error.value = null
    try {
      user.value = await apiFetch<AuthUser>('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify(credentials),
      })
    } catch (e) {
      if (e instanceof ApiRequestError) {
        error.value = e.message
      } else {
        error.value = 'Login failed. Please try again.'
      }
      throw e
    } finally {
      loading.value = false
    }
  }

  async function logout(): Promise<void> {
    try {
      await apiFetch('/api/auth/logout', { method: 'POST' })
    } catch {
      // Clear local state even if server call fails
    }
    user.value = null
  }

  async function register(data: RegisterData): Promise<void> {
    loading.value = true
    error.value = null
    try {
      user.value = await apiFetch<AuthUser>('/api/auth/register', {
        method: 'POST',
        body: JSON.stringify(data),
      })
    } catch (e) {
      if (e instanceof ApiRequestError) {
        error.value = e.message
      } else {
        error.value = 'Registration failed. Please try again.'
      }
      throw e
    } finally {
      loading.value = false
    }
  }

  function clearError(): void {
    error.value = null
  }

  function $reset(): void {
    user.value = null
    initialized.value = false
    loading.value = false
    error.value = null
  }

  return {
    user,
    initialized,
    loading,
    error,
    isAuthenticated,
    isAdmin,
    displayName,
    emailVerified,
    initialize,
    login,
    logout,
    register,
    clearError,
    $reset,
  }
})
