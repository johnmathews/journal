import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import ImageUploadPanel from '../ImageUploadPanel.vue'
import { useEntriesStore } from '@/stores/entries'
import { useJobsStore } from '@/stores/jobs'

vi.mock('@/api/entities', () => ({
  triggerEntityExtraction: vi.fn(),
}))

vi.mock('@/api/jobs', () => ({
  triggerMoodBackfill: vi.fn(),
  getJob: vi.fn(),
}))

// Stub URL.createObjectURL to avoid happy-dom errors
if (typeof URL.createObjectURL === 'undefined') {
  URL.createObjectURL = vi.fn(() => 'blob:mock-url')
}

function mountPanel(
  props: { entryDate: string } = { entryDate: '2026-04-12' },
) {
  return mount(ImageUploadPanel, { props })
}

/**
 * Simulate selecting files via the hidden file input. Sets the `files`
 * property on the input element and fires the `change` event.
 */
async function selectFiles(wrapper: ReturnType<typeof mount>, files: File[]) {
  const input = wrapper.find('input[type="file"]')
  Object.defineProperty(input.element, 'files', {
    value: files,
    writable: false,
    configurable: true,
  })
  await input.trigger('change')
  await flushPromises()
}

describe('ImageUploadPanel', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('renders drop zone', () => {
    const wrapper = mountPanel()
    expect(wrapper.text()).toContain('Drag journal page images')
  })

  it('renders file input accepting images', () => {
    const wrapper = mountPanel()
    const input = wrapper.find('input[type="file"]')
    expect(input.exists()).toBe(true)
    expect(input.attributes('accept')).toContain('image/jpeg')
    expect(input.attributes('accept')).toContain('image/png')
    expect(input.attributes('accept')).toContain('image/gif')
    expect(input.attributes('accept')).toContain('image/webp')
    expect(input.attributes('multiple')).toBeDefined()
  })

  it('shows size limit info', () => {
    const wrapper = mountPanel()
    expect(wrapper.text()).toContain('10 MB')
  })

  it('hides the file input element', () => {
    const wrapper = mountPanel()
    const input = wrapper.find('input[type="file"]')
    expect(input.classes()).toContain('hidden')
  })

  it('does not show submit button before files are added', () => {
    const wrapper = mountPanel()
    expect(wrapper.text()).not.toContain('Upload & Process')
  })

  it('shows file list after images are selected', async () => {
    const wrapper = mountPanel()
    const file = new File(['img'], 'page1.jpg', { type: 'image/jpeg' })

    await selectFiles(wrapper, [file])

    expect(wrapper.text()).toContain('page1.jpg')
  })

  it('shows page count after files are selected', async () => {
    const wrapper = mountPanel()
    const file1 = new File(['img1'], 'page1.jpg', { type: 'image/jpeg' })
    const file2 = new File(['img2'], 'page2.jpg', { type: 'image/jpeg' })

    await selectFiles(wrapper, [file1, file2])

    expect(wrapper.text()).toContain('2 pages')
  })

  it('shows singular "page" for a single file', async () => {
    const wrapper = mountPanel()
    const file = new File(['img'], 'page1.jpg', { type: 'image/jpeg' })

    await selectFiles(wrapper, [file])

    expect(wrapper.text()).toContain('1 page')
  })

  it('shows "Upload & Process" button after files are added', async () => {
    const wrapper = mountPanel()
    const file = new File(['img'], 'page.jpg', { type: 'image/jpeg' })

    await selectFiles(wrapper, [file])

    expect(wrapper.text()).toContain('Upload & Process')
  })

  it('shows remove button for each file', async () => {
    const wrapper = mountPanel()
    const file1 = new File(['img1'], 'page1.jpg', { type: 'image/jpeg' })
    const file2 = new File(['img2'], 'page2.jpg', { type: 'image/jpeg' })

    await selectFiles(wrapper, [file1, file2])

    // Each file row has a remove button (the x character)
    const removeButtons = wrapper.findAll('button[title="Remove"]')
    expect(removeButtons).toHaveLength(2)
  })

  it('removes a file when its remove button is clicked', async () => {
    const wrapper = mountPanel()
    const file1 = new File(['img1'], 'page1.jpg', { type: 'image/jpeg' })
    const file2 = new File(['img2'], 'page2.jpg', { type: 'image/jpeg' })

    await selectFiles(wrapper, [file1, file2])

    // Remove the first file
    const removeButtons = wrapper.findAll('button[title="Remove"]')
    await removeButtons[0].trigger('click')
    await flushPromises()

    expect(wrapper.text()).not.toContain('page1.jpg')
    expect(wrapper.text()).toContain('page2.jpg')
    expect(wrapper.text()).toContain('1 page')
  })

  it('calls uploadImages on the store when submit is clicked', async () => {
    const wrapper = mountPanel()
    const store = useEntriesStore()
    const spy = vi.spyOn(store, 'uploadImages').mockResolvedValue({
      job_id: 'job-123',
      status: 'queued',
    })

    const file = new File(['img'], 'page.jpg', { type: 'image/jpeg' })
    await selectFiles(wrapper, [file])

    const buttons = wrapper.findAll('button')
    const uploadBtn = buttons.find((b) => b.text().includes('Upload & Process'))
    expect(uploadBtn).toBeDefined()
    await uploadBtn!.trigger('click')
    await flushPromises()

    expect(spy).toHaveBeenCalledTimes(1)
    expect(spy).toHaveBeenCalledWith([file], '2026-04-12')
  })

  it('emits submitted with job id after upload', async () => {
    const wrapper = mountPanel()
    const store = useEntriesStore()
    vi.spyOn(store, 'uploadImages').mockResolvedValue({
      job_id: 'job-456',
      status: 'queued',
    })

    const file = new File(['img'], 'page.jpg', { type: 'image/jpeg' })
    await selectFiles(wrapper, [file])

    const buttons = wrapper.findAll('button')
    const uploadBtn = buttons.find((b) => b.text().includes('Upload & Process'))
    await uploadBtn!.trigger('click')
    await flushPromises()

    expect(wrapper.emitted('submitted')).toEqual([['job-456']])
  })

  it('shows "Add image" after initial selection', async () => {
    const wrapper = mountPanel()
    const file = new File(['img'], 'page.jpg', { type: 'image/jpeg' })

    await selectFiles(wrapper, [file])

    expect(wrapper.text()).toContain('Add image')
  })

  it('has move up and move down buttons for reordering', async () => {
    const wrapper = mountPanel()
    const file1 = new File(['img1'], 'page1.jpg', { type: 'image/jpeg' })
    const file2 = new File(['img2'], 'page2.jpg', { type: 'image/jpeg' })

    await selectFiles(wrapper, [file1, file2])

    const upButtons = wrapper.findAll('button[title="Move up"]')
    const downButtons = wrapper.findAll('button[title="Move down"]')
    expect(upButtons).toHaveLength(2)
    expect(downButtons).toHaveLength(2)
  })

  it('disables move-up on the first file and move-down on the last', async () => {
    const wrapper = mountPanel()
    const file1 = new File(['img1'], 'page1.jpg', { type: 'image/jpeg' })
    const file2 = new File(['img2'], 'page2.jpg', { type: 'image/jpeg' })

    await selectFiles(wrapper, [file1, file2])

    const upButtons = wrapper.findAll('button[title="Move up"]')
    const downButtons = wrapper.findAll('button[title="Move down"]')

    // First file's "Move up" should be disabled
    expect(upButtons[0].attributes('disabled')).toBeDefined()
    // Last file's "Move down" should be disabled
    expect(downButtons[1].attributes('disabled')).toBeDefined()
  })

  it('formatSize shows MB for files larger than 1 MB', async () => {
    const wrapper = mountPanel()
    // Create a file > 1 MB (1.5 MB)
    const bigContent = new Uint8Array(1.5 * 1024 * 1024)
    const file = new File([bigContent], 'large.jpg', { type: 'image/jpeg' })

    await selectFiles(wrapper, [file])

    expect(wrapper.text()).toContain('1.5 MB')
  })

  it('moveFile reorders files when move-down is clicked on first item', async () => {
    const wrapper = mountPanel()
    const file1 = new File(['img1'], 'alpha.jpg', { type: 'image/jpeg' })
    const file2 = new File(['img2'], 'beta.jpg', { type: 'image/jpeg' })

    await selectFiles(wrapper, [file1, file2])

    // Verify initial order: alpha is first
    const fileNames = wrapper
      .findAll('.text-sm.font-medium')
      .map((el) => el.text())
    expect(fileNames[0]).toBe('alpha.jpg')
    expect(fileNames[1]).toBe('beta.jpg')

    // Click move-down on the first item
    const downButtons = wrapper.findAll('button[title="Move down"]')
    await downButtons[0].trigger('click')
    await flushPromises()

    // After reorder: beta should be first, alpha second
    const reordered = wrapper
      .findAll('.text-sm.font-medium')
      .map((el) => el.text())
    expect(reordered[0]).toBe('beta.jpg')
    expect(reordered[1]).toBe('alpha.jpg')
  })

  it('filters out non-image files in addFiles', async () => {
    const wrapper = mountPanel()
    const imageFile = new File(['img'], 'photo.jpg', { type: 'image/jpeg' })
    const textFile = new File(['hello'], 'notes.txt', { type: 'text/plain' })
    const pdfFile = new File(['%PDF'], 'doc.pdf', {
      type: 'application/pdf',
    })
    const pngFile = new File(['img'], 'chart.png', { type: 'image/png' })

    await selectFiles(wrapper, [imageFile, textFile, pdfFile, pngFile])

    // Only the two image files should be added
    expect(wrapper.text()).toContain('photo.jpg')
    expect(wrapper.text()).toContain('chart.png')
    expect(wrapper.text()).not.toContain('notes.txt')
    expect(wrapper.text()).not.toContain('doc.pdf')
    expect(wrapper.text()).toContain('2 pages')
  })

  // --- Non-blocking upload flow ---

  it('shows processing screen with OK button after upload', async () => {
    const wrapper = mountPanel()
    const store = useEntriesStore()
    vi.spyOn(store, 'uploadImages').mockResolvedValue({
      job_id: 'job-789',
      status: 'queued',
    })

    const file = new File(['img'], 'page.jpg', { type: 'image/jpeg' })
    await selectFiles(wrapper, [file])

    const uploadBtn = wrapper
      .findAll('button')
      .find((b) => b.text().includes('Upload & Process'))
    await uploadBtn!.trigger('click')
    await flushPromises()

    expect(wrapper.text()).toContain('Processing your journal entry')
    expect(wrapper.find('[data-testid="acknowledge-button"]').exists()).toBe(
      true,
    )
  })

  it('registers job with jobs store via trackJob after upload', async () => {
    const wrapper = mountPanel()
    const entriesStore = useEntriesStore()
    const jobsStore = useJobsStore()
    vi.spyOn(entriesStore, 'uploadImages').mockResolvedValue({
      job_id: 'job-track',
      status: 'queued',
    })
    const trackSpy = vi.spyOn(jobsStore, 'trackJob')

    const file = new File(['img'], 'page.jpg', { type: 'image/jpeg' })
    await selectFiles(wrapper, [file])

    const uploadBtn = wrapper
      .findAll('button')
      .find((b) => b.text().includes('Upload & Process'))
    await uploadBtn!.trigger('click')
    await flushPromises()

    expect(trackSpy).toHaveBeenCalledWith('job-track', 'ingest_images', {
      entry_date: '2026-04-12',
      page_count: 1,
    })
  })

  it('resets form when OK button is clicked', async () => {
    const wrapper = mountPanel()
    const store = useEntriesStore()
    vi.spyOn(store, 'uploadImages').mockResolvedValue({
      job_id: 'job-ack',
      status: 'queued',
    })

    const file = new File(['img'], 'page.jpg', { type: 'image/jpeg' })
    await selectFiles(wrapper, [file])

    const uploadBtn = wrapper
      .findAll('button')
      .find((b) => b.text().includes('Upload & Process'))
    await uploadBtn!.trigger('click')
    await flushPromises()

    // Click OK to dismiss
    await wrapper.find('[data-testid="acknowledge-button"]').trigger('click')
    await flushPromises()

    // Should be back to the upload form (drop zone)
    expect(wrapper.text()).toContain('Drag journal page images')
    expect(wrapper.text()).not.toContain('Processing your journal entry')
  })

  it('does not navigate to entry-detail after upload', async () => {
    const wrapper = mountPanel()
    const store = useEntriesStore()
    vi.spyOn(store, 'uploadImages').mockResolvedValue({
      job_id: 'job-no-nav',
      status: 'queued',
    })

    const file = new File(['img'], 'page.jpg', { type: 'image/jpeg' })
    await selectFiles(wrapper, [file])

    const uploadBtn = wrapper
      .findAll('button')
      .find((b) => b.text().includes('Upload & Process'))
    await uploadBtn!.trigger('click')
    await flushPromises()

    // No 'created' event should be emitted
    expect(wrapper.emitted('created')).toBeUndefined()
  })
})
