import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useEntitiesStore } from '../entities'

vi.mock('@/api/entities', () => ({
  fetchEntities: vi.fn(),
  fetchEntity: vi.fn(),
  fetchEntityMentions: vi.fn(),
  fetchEntityRelationships: vi.fn(),
  fetchEntryEntities: vi.fn(),
  triggerEntityExtraction: vi.fn(),
}))

describe('entities store', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  it('loadEntities stores items and total', async () => {
    const { fetchEntities } = await import('@/api/entities')
    vi.mocked(fetchEntities).mockResolvedValue({
      items: [
        {
          id: 1,
          entity_type: 'person',
          canonical_name: 'Ritsya',
          aliases: [],
          mention_count: 5,
          first_seen: '2026-01-01',
        },
      ],
      total: 1,
      limit: 50,
      offset: 0,
    })

    const store = useEntitiesStore()
    await store.loadEntities()

    expect(store.entities).toHaveLength(1)
    expect(store.entities[0].canonical_name).toBe('Ritsya')
    expect(store.total).toBe(1)
    expect(store.hasEntities).toBe(true)
    expect(store.loading).toBe(false)
  })

  it('loadEntities sets error on failure', async () => {
    const { fetchEntities } = await import('@/api/entities')
    vi.mocked(fetchEntities).mockRejectedValue(new Error('network down'))

    const store = useEntitiesStore()
    await store.loadEntities()

    expect(store.error).toBe('network down')
    expect(store.loading).toBe(false)
  })

  it('loadEntities merges new params with currentParams', async () => {
    const { fetchEntities } = await import('@/api/entities')
    const fetchSpy = vi.mocked(fetchEntities)
    fetchSpy.mockResolvedValue({ items: [], total: 0, limit: 50, offset: 0 })

    const store = useEntitiesStore()
    await store.loadEntities({ type: 'person' })
    await store.loadEntities({ offset: 50 })

    // Second call should still have type='person' AND offset=50.
    const secondCall = fetchSpy.mock.calls[1][0]
    expect(secondCall?.type).toBe('person')
    expect(secondCall?.offset).toBe(50)
  })

  it('loadEntity fetches entity, mentions, and relationships in parallel', async () => {
    const { fetchEntity, fetchEntityMentions, fetchEntityRelationships } =
      await import('@/api/entities')

    vi.mocked(fetchEntity).mockResolvedValue({
      id: 10,
      entity_type: 'person',
      canonical_name: 'Ritsya',
      description: '',
      aliases: [],
      first_seen: '2026-01-01',
      created_at: '',
      updated_at: '',
    })
    vi.mocked(fetchEntityMentions).mockResolvedValue({
      entity_id: 10,
      mentions: [
        {
          id: 1,
          entity_id: 10,
          entry_id: 5,
          entry_date: '2026-03-22',
          quote: 'hello',
          confidence: 0.9,
          extraction_run_id: 'abc',
          created_at: '',
        },
      ],
      total: 1,
    })
    vi.mocked(fetchEntityRelationships).mockResolvedValue({
      entity_id: 10,
      outgoing: [],
      incoming: [],
    })

    const store = useEntitiesStore()
    await store.loadEntity(10)

    expect(store.currentEntity?.canonical_name).toBe('Ritsya')
    expect(store.mentions).toHaveLength(1)
    expect(store.outgoing).toEqual([])
    expect(store.incoming).toEqual([])
    expect(fetchEntity).toHaveBeenCalledWith(10)
    expect(fetchEntityMentions).toHaveBeenCalledWith(10)
    expect(fetchEntityRelationships).toHaveBeenCalledWith(10)
  })

  it('clearCurrent resets current entity state', async () => {
    const store = useEntitiesStore()
    store.currentEntity = {
      id: 1,
      entity_type: 'person',
      canonical_name: 'Test',
      description: '',
      aliases: [],
      first_seen: '',
      created_at: '',
      updated_at: '',
    }
    store.mentions = [
      {
        id: 1,
        entity_id: 1,
        entry_id: 1,
        entry_date: '',
        quote: '',
        confidence: 0,
        extraction_run_id: '',
        created_at: '',
      },
    ]

    store.clearCurrent()

    expect(store.currentEntity).toBeNull()
    expect(store.mentions).toEqual([])
    expect(store.outgoing).toEqual([])
    expect(store.incoming).toEqual([])
  })
})
