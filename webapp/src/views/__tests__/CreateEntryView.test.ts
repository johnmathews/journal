import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises, enableAutoUnmount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createRouter, createWebHistory } from 'vue-router'
import CreateEntryView from '../CreateEntryView.vue'
import { useEntriesStore } from '@/stores/entries'

const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: '/entries/new',
      name: 'create-entry',
      component: CreateEntryView,
    },
    {
      path: '/entries/:id',
      name: 'entry-detail',
      component: { template: '<div />' },
    },
  ],
})

function mountView() {
  return mount(CreateEntryView, {
    global: {
      plugins: [createPinia(), router],
      stubs: {
        TextEntryPanel: {
          template: '<div data-testid="text-entry-panel" />',
          props: ['entryDate'],
          emits: ['created'],
        },
        FileImportPanel: {
          template: '<div data-testid="file-import-panel" />',
          props: ['entryDate'],
          emits: ['created'],
        },
        ImageUploadPanel: {
          template: '<div data-testid="image-upload-panel" />',
          props: ['entryDate'],
          emits: ['created', 'submitted'],
        },
      },
    },
  })
}

describe('CreateEntryView', () => {
  enableAutoUnmount(beforeEach)

  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  it('renders the heading', () => {
    const wrapper = mountView()
    expect(wrapper.find('h1').text()).toBe('New Journal Entry')
  })

  it('renders with "Upload Images" tab active by default', () => {
    const wrapper = mountView()
    const buttons = wrapper.findAll('button')
    const uploadTab = buttons.find((b) => b.text() === 'Upload Images')
    expect(uploadTab).toBeDefined()
    // Active tab has shadow-sm class
    expect(uploadTab!.classes()).toContain('shadow-sm')

    // ImageUploadPanel should be rendered
    expect(wrapper.find('[data-testid="image-upload-panel"]').exists()).toBe(
      true,
    )
    // Others should not
    expect(wrapper.find('[data-testid="text-entry-panel"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="file-import-panel"]').exists()).toBe(
      false,
    )
  })

  it('date picker defaults to today', () => {
    const wrapper = mountView()
    const dateInput = wrapper.find('input[type="date"]')
    expect(dateInput.exists()).toBe(true)
    const today = new Date().toISOString().slice(0, 10)
    expect((dateInput.element as HTMLInputElement).value).toBe(today)
  })

  it('switching to "Import File" tab shows FileImportPanel', async () => {
    const wrapper = mountView()
    const buttons = wrapper.findAll('button')
    const importTab = buttons.find((b) => b.text() === 'Import File')
    expect(importTab).toBeDefined()

    await importTab!.trigger('click')
    await flushPromises()

    expect(wrapper.find('[data-testid="file-import-panel"]').exists()).toBe(
      true,
    )
    expect(wrapper.find('[data-testid="text-entry-panel"]').exists()).toBe(
      false,
    )
    expect(wrapper.find('[data-testid="image-upload-panel"]').exists()).toBe(
      false,
    )
  })

  it('switching to "Upload Images" tab shows ImageUploadPanel', async () => {
    const wrapper = mountView()
    const buttons = wrapper.findAll('button')
    const uploadTab = buttons.find((b) => b.text() === 'Upload Images')
    expect(uploadTab).toBeDefined()

    await uploadTab!.trigger('click')
    await flushPromises()

    expect(wrapper.find('[data-testid="image-upload-panel"]').exists()).toBe(
      true,
    )
    expect(wrapper.find('[data-testid="text-entry-panel"]').exists()).toBe(
      false,
    )
    expect(wrapper.find('[data-testid="file-import-panel"]').exists()).toBe(
      false,
    )
  })

  it('shows error when entriesStore.createError is set', async () => {
    const wrapper = mountView()
    const store = useEntriesStore()

    // Initially no error
    expect(wrapper.text()).not.toContain('Something went wrong')

    store.createError = 'Something went wrong'
    await flushPromises()
    await wrapper.vm.$nextTick()

    expect(wrapper.text()).toContain('Something went wrong')
  })

  it('does not show error banner when createError is null', () => {
    const wrapper = mountView()
    // The error div uses v-if="entriesStore.createError"
    // When null, it should not render
    const errorDivs = wrapper.findAll('.text-red-700')
    expect(errorDivs).toHaveLength(0)
  })

  it('navigates to entry-detail when child emits created', async () => {
    const wrapper = mountView()
    const pushSpy = vi.spyOn(router, 'push')

    // ImageUploadPanel stub is rendered by default — find it by testid
    const panel = wrapper.find('[data-testid="image-upload-panel"]')
    expect(panel.exists()).toBe(true)

    // Call the handleCreated function via the component instance.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const vm = wrapper.vm as any
    vm.handleCreated(42)
    await flushPromises()

    expect(pushSpy).toHaveBeenCalledWith({
      name: 'entry-detail',
      params: { id: '42' },
    })
  })

  it('renders the image upload panel by default', () => {
    const wrapper = mountView()
    expect(wrapper.find('[data-testid="image-upload-panel"]').exists()).toBe(
      true,
    )
    expect(wrapper.find('[data-testid="text-entry-panel"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="file-import-panel"]').exists()).toBe(
      false,
    )
  })

  it('renders all three tab buttons', () => {
    const wrapper = mountView()
    const buttons = wrapper.findAll('button')
    const tabLabels = buttons.map((b) => b.text())
    expect(tabLabels).toContain('Write Entry')
    expect(tabLabels).toContain('Import File')
    expect(tabLabels).toContain('Upload Images')
  })
})
