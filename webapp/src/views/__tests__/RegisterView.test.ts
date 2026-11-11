import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createRouter, createWebHistory } from 'vue-router'
import RegisterView from '../RegisterView.vue'
import { useAuthStore } from '@/stores/auth'

vi.mock('@/api/client', () => ({
  apiFetch: vi.fn(),
  ApiRequestError: class ApiRequestError extends Error {
    constructor(
      public status: number,
      public errorCode: string,
      message: string,
    ) {
      super(message)
      this.name = 'ApiRequestError'
    }
  },
}))

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', name: 'dashboard', component: { template: '<div/>' } },
    { path: '/login', name: 'login', component: { template: '<div/>' } },
    { path: '/register', name: 'register', component: RegisterView },
  ],
})

function mountComponent() {
  return mount(RegisterView, {
    global: {
      plugins: [createPinia(), router],
    },
  })
}

describe('RegisterView', () => {
  beforeEach(async () => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    router.push('/register')
    await router.isReady()
  })

  it('renders the heading', () => {
    const wrapper = mountComponent()
    expect(wrapper.find('h1').text()).toBe('Create Account')
  })

  it('renders display name, email and password fields', () => {
    const wrapper = mountComponent()
    expect(wrapper.find('#register-name').exists()).toBe(true)
    expect(wrapper.find('#register-email').exists()).toBe(true)
    expect(wrapper.find('#register-password').exists()).toBe(true)
  })

  it('submits form and calls auth store register', async () => {
    const wrapper = mountComponent()
    const authStore = useAuthStore()
    const registerSpy = vi.spyOn(authStore, 'register').mockResolvedValue()

    await wrapper.find('#register-name').setValue('John Doe')
    await wrapper.find('#register-email').setValue('john@example.com')
    await wrapper.find('#register-password').setValue('strongpassword')
    await wrapper.find('form').trigger('submit')

    expect(registerSpy).toHaveBeenCalledWith({
      email: 'john@example.com',
      password: 'strongpassword',
      display_name: 'John Doe',
    })
  })

  it('shows error when registration fails', async () => {
    const wrapper = mountComponent()
    const authStore = useAuthStore()

    authStore.error = 'Email already registered'
    await wrapper.vm.$nextTick()

    expect(wrapper.text()).toContain('Email already registered')
  })

  it('disables submit button while loading', async () => {
    const wrapper = mountComponent()
    const authStore = useAuthStore()

    authStore.loading = true
    await wrapper.vm.$nextTick()

    const button = wrapper.find('button[type="submit"]')
    expect((button.element as HTMLButtonElement).disabled).toBe(true)
    expect(button.text()).toBe('Creating account...')
  })

  it('shows full name helper text on display name field', () => {
    const wrapper = mountComponent()
    const hint = wrapper.find('[data-testid="register-name-hint"]')
    expect(hint.exists()).toBe(true)
    expect(hint.text()).toContain('full name')
  })

  it('shows sign in link', () => {
    const wrapper = mountComponent()
    expect(wrapper.text()).toContain('Already have an account?')
    expect(wrapper.text()).toContain('Sign in')
  })

  it('clears error on email input focus', async () => {
    const wrapper = mountComponent()
    const authStore = useAuthStore()

    authStore.error = 'Some error'
    await wrapper.vm.$nextTick()

    const clearSpy = vi.spyOn(authStore, 'clearError')
    await wrapper.find('#register-email').trigger('focus')

    expect(clearSpy).toHaveBeenCalled()
  })

  it('clears error on name input focus', async () => {
    const wrapper = mountComponent()
    const authStore = useAuthStore()

    authStore.error = 'Some error'
    await wrapper.vm.$nextTick()

    const clearSpy = vi.spyOn(authStore, 'clearError')
    await wrapper.find('#register-name').trigger('focus')

    expect(clearSpy).toHaveBeenCalled()
  })

  it('clears error on password input focus', async () => {
    const wrapper = mountComponent()
    const authStore = useAuthStore()

    authStore.error = 'Some error'
    await wrapper.vm.$nextTick()

    const clearSpy = vi.spyOn(authStore, 'clearError')
    await wrapper.find('#register-password').trigger('focus')

    expect(clearSpy).toHaveBeenCalled()
  })

  it('navigates to dashboard on successful registration', async () => {
    const wrapper = mountComponent()
    const authStore = useAuthStore()
    const pushSpy = vi.spyOn(router, 'push')

    vi.spyOn(authStore, 'register').mockResolvedValue()

    await wrapper.find('#register-name').setValue('Jane')
    await wrapper.find('#register-email').setValue('jane@example.com')
    await wrapper.find('#register-password').setValue('password123')
    await wrapper.find('form').trigger('submit')
    await new Promise((r) => setTimeout(r, 10))

    expect(pushSpy).toHaveBeenCalledWith({ name: 'dashboard' })
  })
})
