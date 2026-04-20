import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import FileUploadPanel from '../FileUploadPanel.vue'
import { useEntriesStore } from '@/stores/entries'
import { useJobsStore } from '@/stores/jobs'

vi.mock('@/api/entities', () => ({
  triggerEntityExtraction: vi.fn(),
}))

vi.mock('@/api/jobs', () => ({
  triggerMoodBackfill: vi.fn(),
  getJob: vi.fn(),
}))

if (typeof URL.createObjectURL === 'undefined') {
  URL.createObjectURL = vi.fn(() => 'blob:mock-url')
}

function mountPanel(
  props: { entryDate: string } = { entryDate: '2026-04-12' },
) {
  return mount(FileUploadPanel, { props })
}

async function selectFiles(wrapper: ReturnType<typeof mount>, files: File[]) {
  const input = wrapper.find('[data-testid="file-input"]')
  Object.defineProperty(input.element, 'files', {
    value: files,
    writable: false,
    configurable: true,
  })
  await input.trigger('change')
  await flushPromises()
}

describe('FileUploadPanel', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  // --- Idle / drop zone ---

  it('renders unified drop zone', () => {
    const wrapper = mountPanel()
    expect(wrapper.text()).toContain('Drag files here')
  })

  it('mentions both images and text files in the drop zone', () => {
    const wrapper = mountPanel()
    expect(wrapper.text()).toContain('Images')
    expect(wrapper.text()).toContain('.md')
    expect(wrapper.text()).toContain('.txt')
  })

  it('renders a file input accepting images and text files', () => {
    const wrapper = mountPanel()
    const input = wrapper.find('[data-testid="file-input"]')
    expect(input.exists()).toBe(true)
    const accept = input.attributes('accept') || ''
    expect(accept).toContain('image/jpeg')
    expect(accept).toContain('.md')
    expect(accept).toContain('.txt')
  })

  it('hides the file input element', () => {
    const wrapper = mountPanel()
    const input = wrapper.find('[data-testid="file-input"]')
    expect(input.classes()).toContain('hidden')
  })

  it('does not show submit buttons before files are added', () => {
    const wrapper = mountPanel()
    expect(wrapper.text()).not.toContain('Upload & Process')
    expect(wrapper.text()).not.toContain('Import File')
  })

  // --- Drag and drop ---

  it('highlights drop zone on dragover', async () => {
    const wrapper = mountPanel()
    const label = wrapper.find('label')
    await label.trigger('dragover')
    expect(label.classes()).toContain('border-violet-400')
  })

  it('removes highlight on dragleave', async () => {
    const wrapper = mountPanel()
    const label = wrapper.find('label')
    await label.trigger('dragover')
    await label.trigger('dragleave')
    expect(label.classes()).not.toContain('border-violet-400')
  })

  it('accepts dropped image files', async () => {
    const wrapper = mountPanel()
    const label = wrapper.find('label')
    const file = new File(['img'], 'page.jpg', { type: 'image/jpeg' })

    await label.trigger('drop', {
      dataTransfer: { files: [file] },
    })
    await flushPromises()

    expect(wrapper.text()).toContain('page.jpg')
    expect(wrapper.text()).toContain('Upload & Process')
  })

  it('accepts dropped text files', async () => {
    const wrapper = mountPanel()
    const label = wrapper.find('label')
    const file = new File(['# My entry'], 'journal.md', {
      type: 'text/markdown',
    })

    await label.trigger('drop', {
      dataTransfer: { files: [file] },
    })
    await flushPromises()

    expect(wrapper.text()).toContain('journal.md')
    expect(wrapper.text()).toContain('Import File')
  })

  // --- Image mode ---

  it('enters image mode when images are selected', async () => {
    const wrapper = mountPanel()
    const file = new File(['img'], 'page1.jpg', { type: 'image/jpeg' })
    await selectFiles(wrapper, [file])

    expect(wrapper.text()).toContain('page1.jpg')
    expect(wrapper.text()).toContain('1 page')
    expect(wrapper.text()).toContain('Upload & Process')
  })

  it('shows page count for multiple images', async () => {
    const wrapper = mountPanel()
    const file1 = new File(['img1'], 'page1.jpg', { type: 'image/jpeg' })
    const file2 = new File(['img2'], 'page2.jpg', { type: 'image/jpeg' })
    await selectFiles(wrapper, [file1, file2])

    expect(wrapper.text()).toContain('2 pages')
  })

  it('shows remove button for each image', async () => {
    const wrapper = mountPanel()
    const file1 = new File(['img1'], 'page1.jpg', { type: 'image/jpeg' })
    const file2 = new File(['img2'], 'page2.jpg', { type: 'image/jpeg' })
    await selectFiles(wrapper, [file1, file2])

    const removeButtons = wrapper.findAll('button[title="Remove"]')
    expect(removeButtons).toHaveLength(2)
  })

  it('removes a file and returns to idle when last image removed', async () => {
    const wrapper = mountPanel()
    const file = new File(['img'], 'page.jpg', { type: 'image/jpeg' })
    await selectFiles(wrapper, [file])

    const removeButton = wrapper.find('button[title="Remove"]')
    await removeButton.trigger('click')
    await flushPromises()

    expect(wrapper.text()).toContain('Drag files here')
    expect(wrapper.text()).not.toContain('page.jpg')
  })

  it('has move up and move down buttons for reordering', async () => {
    const wrapper = mountPanel()
    const file1 = new File(['img1'], 'page1.jpg', { type: 'image/jpeg' })
    const file2 = new File(['img2'], 'page2.jpg', { type: 'image/jpeg' })
    await selectFiles(wrapper, [file1, file2])

    expect(wrapper.findAll('button[title="Move up"]')).toHaveLength(2)
    expect(wrapper.findAll('button[title="Move down"]')).toHaveLength(2)
  })

  it('reorders files when move-down is clicked', async () => {
    const wrapper = mountPanel()
    const file1 = new File(['img1'], 'alpha.jpg', { type: 'image/jpeg' })
    const file2 = new File(['img2'], 'beta.jpg', { type: 'image/jpeg' })
    await selectFiles(wrapper, [file1, file2])

    const downButtons = wrapper.findAll('button[title="Move down"]')
    await downButtons[0].trigger('click')
    await flushPromises()

    const fileNames = wrapper
      .findAll('.text-sm.font-medium')
      .map((el) => el.text())
    expect(fileNames[0]).toBe('beta.jpg')
    expect(fileNames[1]).toBe('alpha.jpg')
  })

  it('filters out non-image non-text files', async () => {
    const wrapper = mountPanel()
    const imageFile = new File(['img'], 'photo.jpg', { type: 'image/jpeg' })
    const pdfFile = new File(['%PDF'], 'doc.pdf', {
      type: 'application/pdf',
    })
    await selectFiles(wrapper, [imageFile, pdfFile])

    expect(wrapper.text()).toContain('photo.jpg')
    expect(wrapper.text()).not.toContain('doc.pdf')
    expect(wrapper.text()).toContain('1 page')
  })

  it('accepts HEIC files from macOS Photos', async () => {
    const wrapper = mountPanel()
    const file = new File(['heic-data'], 'IMG_1234.HEIC', {
      type: 'image/heic',
    })
    await selectFiles(wrapper, [file])

    expect(wrapper.text()).toContain('IMG_1234.HEIC')
    expect(wrapper.text()).toContain('Upload & Process')
  })

  it('accepts HEIF files', async () => {
    const wrapper = mountPanel()
    const file = new File(['heif-data'], 'photo.heif', {
      type: 'image/heif',
    })
    await selectFiles(wrapper, [file])

    expect(wrapper.text()).toContain('photo.heif')
    expect(wrapper.text()).toContain('1 page')
  })

  it('shows a warning when all selected files are unsupported', async () => {
    const wrapper = mountPanel()
    const pdf = new File(['%PDF'], 'doc.pdf', { type: 'application/pdf' })
    await selectFiles(wrapper, [pdf])

    const warning = wrapper.find('[data-testid="file-warning"]')
    expect(warning.exists()).toBe(true)
    expect(warning.text()).toContain('Unsupported file type')
    expect(warning.text()).toContain('application/pdf')
  })

  it('does not show warning when valid files are selected alongside unsupported ones', async () => {
    const wrapper = mountPanel()
    const image = new File(['img'], 'photo.jpg', { type: 'image/jpeg' })
    const pdf = new File(['%PDF'], 'doc.pdf', { type: 'application/pdf' })
    await selectFiles(wrapper, [image, pdf])

    expect(wrapper.find('[data-testid="file-warning"]').exists()).toBe(false)
    expect(wrapper.text()).toContain('photo.jpg')
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

  it('emits submitted with job id after image upload', async () => {
    const wrapper = mountPanel()
    const store = useEntriesStore()
    vi.spyOn(store, 'uploadImages').mockResolvedValue({
      job_id: 'job-456',
      status: 'queued',
    })

    const file = new File(['img'], 'page.jpg', { type: 'image/jpeg' })
    await selectFiles(wrapper, [file])

    const uploadBtn = wrapper
      .findAll('button')
      .find((b) => b.text().includes('Upload & Process'))
    await uploadBtn!.trigger('click')
    await flushPromises()

    expect(wrapper.emitted('submitted')).toEqual([['job-456']])
  })

  it('shows processing screen after image upload', async () => {
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

  it('resets form when OK button is clicked after upload', async () => {
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

    await wrapper.find('[data-testid="acknowledge-button"]').trigger('click')
    await flushPromises()

    expect(wrapper.text()).toContain('Drag files here')
    expect(wrapper.text()).not.toContain('Processing your journal entry')
  })

  it('registers job with jobs store after image upload', async () => {
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

  it('auto-dismisses when job completes', async () => {
    const wrapper = mountPanel()
    const entriesStore = useEntriesStore()
    const jobsStore = useJobsStore()
    vi.spyOn(entriesStore, 'uploadImages').mockResolvedValue({
      job_id: 'job-auto',
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

    jobsStore.jobs['job-auto'] = {
      id: 'job-auto',
      type: 'ingest_images',
      status: 'succeeded',
      params: {},
      progress_current: 1,
      progress_total: 1,
      result: { entry_id: 99 },
      error_message: null,
      status_detail: null,
      created_at: new Date().toISOString(),
      started_at: new Date().toISOString(),
      finished_at: new Date().toISOString(),
    }
    await flushPromises()

    expect(wrapper.text()).toContain('Drag files here')
  })

  it('shows formatSize in MB for large files', async () => {
    const wrapper = mountPanel()
    const bigContent = new Uint8Array(1.5 * 1024 * 1024)
    const file = new File([bigContent], 'large.jpg', { type: 'image/jpeg' })
    await selectFiles(wrapper, [file])

    expect(wrapper.text()).toContain('1.5 MB')
  })

  // --- Text mode ---

  it('enters text mode when a .md file is selected', async () => {
    const wrapper = mountPanel()
    const file = new File(['# My journal entry'], 'entry.md', {
      type: 'text/markdown',
    })
    await selectFiles(wrapper, [file])

    expect(wrapper.text()).toContain('Markdown')
    expect(wrapper.text()).toContain('entry.md')
    expect(wrapper.text()).toContain('Import File')
  })

  it('enters text mode when a .txt file is selected', async () => {
    const wrapper = mountPanel()
    const file = new File(['Just text'], 'notes.txt', { type: 'text/plain' })
    await selectFiles(wrapper, [file])

    expect(wrapper.text()).toContain('Plain Text')
    expect(wrapper.text()).toContain('notes.txt')
  })

  it('shows "Change file" button in text mode', async () => {
    const wrapper = mountPanel()
    const file = new File(['content'], 'test.txt', { type: 'text/plain' })
    await selectFiles(wrapper, [file])

    expect(wrapper.text()).toContain('Change file')
  })

  it('returns to idle when "Change file" is clicked', async () => {
    const wrapper = mountPanel()
    const file = new File(['content'], 'test.txt', { type: 'text/plain' })
    await selectFiles(wrapper, [file])

    const changeBtn = wrapper
      .findAll('button')
      .find((b) => b.text().includes('Change file'))
    expect(changeBtn).toBeDefined()
    await changeBtn!.trigger('click')
    await flushPromises()

    expect(wrapper.text()).toContain('Drag files here')
    expect(wrapper.text()).not.toContain('test.txt')
  })

  it('shows file size for text files', async () => {
    const wrapper = mountPanel()
    const file = new File(['ab'], 'tiny.txt', { type: 'text/plain' })
    await selectFiles(wrapper, [file])

    expect(wrapper.text()).toContain('2 B')
  })

  it('shows KB format for larger text files', async () => {
    const wrapper = mountPanel()
    const content = 'x'.repeat(2048)
    const file = new File([content], 'medium.txt', { type: 'text/plain' })
    await selectFiles(wrapper, [file])

    expect(wrapper.text()).toContain('2.0 KB')
  })

  it('calls importFile on the store when Import File is clicked', async () => {
    const wrapper = mountPanel()
    const store = useEntriesStore()
    const spy = vi.spyOn(store, 'importFile').mockResolvedValue({
      entry: {
        id: 7,
        entry_date: '2026-04-12',
        source_type: 'imported_text_file',
        raw_text: 'file content',
        final_text: 'file content',
        page_count: 1,
        word_count: 2,
        chunk_count: 1,
        language: 'en',
        created_at: '',
        updated_at: '',
        doubts_verified: false,
        uncertain_spans: [],
      },
      mood_job_id: null,
    })

    const file = new File(['# My journal entry'], 'entry.md', {
      type: 'text/markdown',
    })
    await selectFiles(wrapper, [file])

    const importBtn = wrapper
      .findAll('button')
      .find((b) => b.text().includes('Import'))
    await importBtn!.trigger('click')
    await flushPromises()

    expect(spy).toHaveBeenCalledWith(file, '2026-04-12')
  })

  it('emits created with entry id after text import', async () => {
    const wrapper = mountPanel()
    const store = useEntriesStore()
    vi.spyOn(store, 'importFile').mockResolvedValue({
      entry: {
        id: 55,
        entry_date: '2026-04-12',
        source_type: 'imported_text_file',
        raw_text: 'content',
        final_text: 'content',
        page_count: 1,
        word_count: 1,
        chunk_count: 1,
        language: 'en',
        created_at: '',
        updated_at: '',
        doubts_verified: false,
        uncertain_spans: [],
      },
      mood_job_id: null,
    })

    const file = new File(['content'], 'notes.txt', { type: 'text/plain' })
    await selectFiles(wrapper, [file])

    const importBtn = wrapper
      .findAll('button')
      .find((b) => b.text().includes('Import'))
    await importBtn!.trigger('click')
    await flushPromises()

    expect(wrapper.emitted('created')).toEqual([[55]])
  })

  // --- Progress display ---

  it('displays progress correctly during image processing', async () => {
    const wrapper = mountPanel()
    const entriesStore = useEntriesStore()
    const jobsStore = useJobsStore()
    vi.spyOn(entriesStore, 'uploadImages').mockResolvedValue({
      job_id: 'job-progress',
      status: 'queued',
    })

    const file = new File(['img'], 'page.jpg', { type: 'image/jpeg' })
    await selectFiles(wrapper, [file])

    const uploadBtn = wrapper
      .findAll('button')
      .find((b) => b.text().includes('Upload & Process'))
    await uploadBtn!.trigger('click')
    await flushPromises()

    jobsStore.jobs['job-progress'] = {
      id: 'job-progress',
      type: 'ingest_images',
      status: 'running',
      params: {},
      progress_current: 2,
      progress_total: 3,
      result: null,
      error_message: null,
      status_detail: null,
      created_at: new Date().toISOString(),
      started_at: new Date().toISOString(),
      finished_at: null,
    }
    await flushPromises()

    expect(wrapper.text()).toContain('page 2 of 3')
  })
})
