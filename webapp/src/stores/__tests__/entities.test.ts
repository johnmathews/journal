import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useEntitiesStore } from '../entities'
import type { Entity } from '@/types/entity'

vi.mock('@/api/entities', () => ({
  fetchEntities: vi.fn(),
  fetchEntity: vi.fn(),
  fetchEntityMentions: vi.fn(),
  fetchEntityRelationships: vi.fn(),
  fetchEntryEntities: vi.fn(),
  triggerEntityExtraction: vi.fn(),
  updateEntity: vi.fn(),
  deleteEntity: vi.fn(),
  mergeEntities: vi.fn(),
  fetchMergeCandidates: vi.fn(),
  resolveMergeCandidate: vi.fn(),
  fetchQuarantinedEntities: vi.fn(),
  quarantineEntity: vi.fn(),
  releaseQuarantine: vi.fn(),
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
          last_seen: '2026-03-22',
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

  it('loadEntities falls back to a generic message when the rejection is not an Error', async () => {
    const { fetchEntities } = await import('@/api/entities')
    // Reject with a plain string so `e instanceof Error` is false — covers
    // the fallback branch of the ternary.
    vi.mocked(fetchEntities).mockRejectedValue('boom')

    const store = useEntitiesStore()
    await store.loadEntities()

    expect(store.error).toBe('Failed to load entities')
    expect(store.loading).toBe(false)
  })

  it('loadEntity surfaces the error message when fetch rejects with an Error', async () => {
    const { fetchEntity } = await import('@/api/entities')
    vi.mocked(fetchEntity).mockRejectedValue(new Error('not found'))

    const store = useEntitiesStore()
    await store.loadEntity(99)

    expect(store.error).toBe('not found')
    expect(store.detailLoading).toBe(false)
    expect(store.currentEntity).toBeNull()
  })

  it('loadEntity falls back to a generic message when the rejection is not an Error', async () => {
    const { fetchEntity } = await import('@/api/entities')
    vi.mocked(fetchEntity).mockRejectedValue({ kind: 'plain-object' })

    const store = useEntitiesStore()
    await store.loadEntity(99)

    expect(store.error).toBe('Failed to load entity')
    expect(store.detailLoading).toBe(false)
  })

  it('totalPages falls back to 50 when limit is 0', () => {
    const store = useEntitiesStore()
    store.total = 100
    store.currentParams = { limit: 0, offset: 0 }
    // limit || 50 → 50, so 100/50 = 2
    expect(store.totalPages).toBe(2)
  })

  it('currentPage falls back to defaults when offset and limit are 0', () => {
    const store = useEntitiesStore()
    store.currentParams = { limit: 0, offset: 0 }
    // (offset||0)/(limit||50) + 1 → 0/50 + 1 = 1
    expect(store.currentPage).toBe(1)
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

  describe('updateCurrentEntity', () => {
    it('updates currentEntity and syncs the list cache on success', async () => {
      const { updateEntity } = await import('@/api/entities')
      const updatedEntity = {
        id: 5,
        entity_type: 'place' as const,
        canonical_name: 'Updated Name',
        description: 'new desc',
        aliases: ['alias1'],
        first_seen: '2026-01-01',
        created_at: '2026-01-01',
        updated_at: '2026-04-12',
      }
      vi.mocked(updateEntity).mockResolvedValue(updatedEntity)

      const store = useEntitiesStore()
      store.currentEntity = {
        id: 5,
        entity_type: 'person',
        canonical_name: 'Old Name',
        description: '',
        aliases: [],
        first_seen: '2026-01-01',
        created_at: '2026-01-01',
        updated_at: '2026-01-01',
      }
      store.entities = [
        {
          id: 5,
          entity_type: 'person',
          canonical_name: 'Old Name',
          aliases: [],
          mention_count: 3,
          first_seen: '2026-01-01',
          last_seen: '2026-03-01',
        },
      ]

      const result = await store.updateCurrentEntity({
        canonical_name: 'Updated Name',
      })

      expect(result).toEqual(updatedEntity)
      expect(store.currentEntity).toEqual(updatedEntity)
      expect(store.entities[0].canonical_name).toBe('Updated Name')
      expect(store.entities[0].entity_type).toBe('place')
      expect(store.entities[0].aliases).toEqual(['alias1'])
      // mention_count should be preserved from the original summary
      expect(store.entities[0].mention_count).toBe(3)
      expect(updateEntity).toHaveBeenCalledWith(5, {
        canonical_name: 'Updated Name',
      })
    })

    it('throws when no entity is selected', async () => {
      const store = useEntitiesStore()
      store.currentEntity = null

      await expect(
        store.updateCurrentEntity({ canonical_name: 'X' }),
      ).rejects.toThrow('No entity selected')
      expect(store.error).toBe('No entity selected')
    })

    it('sets error and re-throws on API failure', async () => {
      const { updateEntity } = await import('@/api/entities')
      vi.mocked(updateEntity).mockRejectedValue(new Error('server error'))

      const store = useEntitiesStore()
      store.currentEntity = {
        id: 1,
        entity_type: 'person',
        canonical_name: 'A',
        description: '',
        aliases: [],
        first_seen: '',
        created_at: '',
        updated_at: '',
      }

      await expect(
        store.updateCurrentEntity({ canonical_name: 'B' }),
      ).rejects.toThrow('server error')
      expect(store.error).toBe('server error')
    })

    it('falls back to generic message for non-Error rejection', async () => {
      const { updateEntity } = await import('@/api/entities')
      vi.mocked(updateEntity).mockRejectedValue('string rejection')

      const store = useEntitiesStore()
      store.currentEntity = {
        id: 1,
        entity_type: 'person',
        canonical_name: 'A',
        description: '',
        aliases: [],
        first_seen: '',
        created_at: '',
        updated_at: '',
      }

      await expect(
        store.updateCurrentEntity({ canonical_name: 'B' }),
      ).rejects.toBe('string rejection')
      expect(store.error).toBe('Failed to update entity')
    })
  })

  describe('removeEntity', () => {
    it('removes entity from list, decrements total, and clears currentEntity when it matches', async () => {
      const { deleteEntity } = await import('@/api/entities')
      vi.mocked(deleteEntity).mockResolvedValue({ deleted: true, id: 7 })

      const store = useEntitiesStore()
      store.entities = [
        {
          id: 7,
          entity_type: 'person',
          canonical_name: 'ToDelete',
          aliases: [],
          mention_count: 1,
          first_seen: '2026-01-01',
          last_seen: '2026-01-01',
        },
        {
          id: 8,
          entity_type: 'place',
          canonical_name: 'Keep',
          aliases: [],
          mention_count: 2,
          first_seen: '2026-01-01',
          last_seen: '2026-01-01',
        },
      ]
      store.total = 2
      store.currentEntity = {
        id: 7,
        entity_type: 'person',
        canonical_name: 'ToDelete',
        description: '',
        aliases: [],
        first_seen: '',
        created_at: '',
        updated_at: '',
      }

      await store.removeEntity(7)

      expect(deleteEntity).toHaveBeenCalledWith(7)
      expect(store.entities).toHaveLength(1)
      expect(store.entities[0].id).toBe(8)
      expect(store.total).toBe(1)
      expect(store.currentEntity).toBeNull()
    })

    it('does not clear currentEntity when a different entity is removed', async () => {
      const { deleteEntity } = await import('@/api/entities')
      vi.mocked(deleteEntity).mockResolvedValue({ deleted: true, id: 9 })

      const store = useEntitiesStore()
      store.entities = [
        {
          id: 9,
          entity_type: 'person',
          canonical_name: 'Gone',
          aliases: [],
          mention_count: 1,
          first_seen: '',
          last_seen: '',
        },
      ]
      store.total = 1
      store.currentEntity = {
        id: 99,
        entity_type: 'place',
        canonical_name: 'Different',
        description: '',
        aliases: [],
        first_seen: '',
        created_at: '',
        updated_at: '',
      }

      await store.removeEntity(9)

      expect(store.currentEntity?.id).toBe(99)
    })

    it('sets error and re-throws on failure', async () => {
      const { deleteEntity } = await import('@/api/entities')
      vi.mocked(deleteEntity).mockRejectedValue(new Error('forbidden'))

      const store = useEntitiesStore()

      await expect(store.removeEntity(1)).rejects.toThrow('forbidden')
      expect(store.error).toBe('forbidden')
    })

    it('falls back to generic message for non-Error rejection', async () => {
      const { deleteEntity } = await import('@/api/entities')
      vi.mocked(deleteEntity).mockRejectedValue('string rejection')

      const store = useEntitiesStore()

      await expect(store.removeEntity(1)).rejects.toBe('string rejection')
      expect(store.error).toBe('Failed to delete entity')
    })
  })

  describe('mergeEntities', () => {
    it('removes absorbed entities, decrements total, and updates survivor in list', async () => {
      const { mergeEntities: mergeEntitiesApi } = await import('@/api/entities')
      const mergeResponse = {
        survivor: {
          id: 1,
          entity_type: 'person' as const,
          canonical_name: 'Merged Name',
          description: '',
          aliases: ['old-alias'],
          first_seen: '2026-01-01',
          created_at: '',
          updated_at: '',
        },
        absorbed_ids: [2, 3],
        mentions_reassigned: 5,
        relationships_reassigned: 2,
        aliases_added: 1,
      }
      vi.mocked(mergeEntitiesApi).mockResolvedValue(mergeResponse)

      const store = useEntitiesStore()
      store.entities = [
        {
          id: 1,
          entity_type: 'person',
          canonical_name: 'Original',
          aliases: [],
          mention_count: 3,
          first_seen: '2026-01-01',
          last_seen: '2026-03-01',
        },
        {
          id: 2,
          entity_type: 'person',
          canonical_name: 'Absorbed1',
          aliases: [],
          mention_count: 1,
          first_seen: '2026-02-01',
          last_seen: '2026-02-01',
        },
        {
          id: 3,
          entity_type: 'person',
          canonical_name: 'Absorbed2',
          aliases: [],
          mention_count: 2,
          first_seen: '2026-03-01',
          last_seen: '2026-03-01',
        },
      ]
      store.total = 3

      const result = await store.mergeEntities(1, [2, 3])

      expect(result).toEqual(mergeResponse)
      expect(mergeEntitiesApi).toHaveBeenCalledWith({
        survivor_id: 1,
        absorbed_ids: [2, 3],
      })
      expect(store.entities).toHaveLength(1)
      expect(store.entities[0].id).toBe(1)
      expect(store.entities[0].canonical_name).toBe('Merged Name')
      expect(store.entities[0].aliases).toEqual(['old-alias'])
      expect(store.total).toBe(1)
    })

    it('works when survivor is not in the list (idx === -1)', async () => {
      const { mergeEntities: mergeEntitiesApi } = await import('@/api/entities')
      vi.mocked(mergeEntitiesApi).mockResolvedValue({
        survivor: {
          id: 100,
          entity_type: 'person',
          canonical_name: 'Survivor',
          description: '',
          aliases: [],
          first_seen: '',
          created_at: '',
          updated_at: '',
        },
        absorbed_ids: [2],
        mentions_reassigned: 0,
        relationships_reassigned: 0,
        aliases_added: 0,
      })

      const store = useEntitiesStore()
      store.entities = [
        {
          id: 2,
          entity_type: 'person',
          canonical_name: 'Absorbed',
          aliases: [],
          mention_count: 1,
          first_seen: '',
          last_seen: '',
        },
      ]
      store.total = 1

      await store.mergeEntities(100, [2])

      // Absorbed entity removed, survivor not in list so no update
      expect(store.entities).toHaveLength(0)
      expect(store.total).toBe(0)
    })

    it('sets error and re-throws on failure', async () => {
      const { mergeEntities: mergeEntitiesApi } = await import('@/api/entities')
      vi.mocked(mergeEntitiesApi).mockRejectedValue(new Error('merge failed'))

      const store = useEntitiesStore()

      await expect(store.mergeEntities(1, [2])).rejects.toThrow('merge failed')
      expect(store.error).toBe('merge failed')
    })

    it('falls back to generic message for non-Error rejection', async () => {
      const { mergeEntities: mergeEntitiesApi } = await import('@/api/entities')
      vi.mocked(mergeEntitiesApi).mockRejectedValue(42)

      const store = useEntitiesStore()

      await expect(store.mergeEntities(1, [2])).rejects.toBe(42)
      expect(store.error).toBe('Failed to merge entities')
    })

    it('handles response with no survivor (null)', async () => {
      const { mergeEntities: mergeEntitiesApi } = await import('@/api/entities')
      vi.mocked(mergeEntitiesApi).mockResolvedValue({
        survivor: null as unknown as Entity,
        absorbed_ids: [2],
        mentions_reassigned: 0,
        relationships_reassigned: 0,
        aliases_added: 0,
      })

      const store = useEntitiesStore()
      store.entities = [
        {
          id: 1,
          entity_type: 'person',
          canonical_name: 'Survivor',
          aliases: [],
          mention_count: 3,
          first_seen: '',
          last_seen: '',
        },
        {
          id: 2,
          entity_type: 'person',
          canonical_name: 'Absorbed',
          aliases: [],
          mention_count: 1,
          first_seen: '',
          last_seen: '',
        },
      ]
      store.total = 2

      const result = await store.mergeEntities(1, [2])

      // Absorbed removed, survivor left untouched since result.survivor is falsy
      expect(store.entities).toHaveLength(1)
      expect(store.entities[0].canonical_name).toBe('Survivor')
      expect(result.survivor).toBeNull()
    })
  })

  describe('loadMergeCandidates', () => {
    it('populates mergeCandidates and mergeCandidatesTotal on success', async () => {
      const { fetchMergeCandidates } = await import('@/api/entities')
      const candidate = {
        id: 10,
        entity_a: {
          id: 1,
          entity_type: 'person' as const,
          canonical_name: 'A',
          aliases: [],
          mention_count: 2,
          first_seen: '2026-01-01',
          last_seen: '2026-02-01',
        },
        entity_b: {
          id: 2,
          entity_type: 'person' as const,
          canonical_name: 'B',
          aliases: [],
          mention_count: 3,
          first_seen: '2026-01-01',
          last_seen: '2026-03-01',
        },
        similarity: 0.92,
        status: 'pending' as const,
        extraction_run_id: 'run-1',
        created_at: '2026-04-01',
      }
      vi.mocked(fetchMergeCandidates).mockResolvedValue({
        items: [candidate],
        total: 1,
      })

      const store = useEntitiesStore()
      await store.loadMergeCandidates()

      expect(fetchMergeCandidates).toHaveBeenCalledWith('pending')
      expect(store.mergeCandidates).toHaveLength(1)
      expect(store.mergeCandidates[0].id).toBe(10)
      expect(store.mergeCandidatesTotal).toBe(1)
      expect(store.mergeCandidatesLoading).toBe(false)
    })

    it('sets error message on failure', async () => {
      const { fetchMergeCandidates } = await import('@/api/entities')
      vi.mocked(fetchMergeCandidates).mockRejectedValue(new Error('timeout'))

      const store = useEntitiesStore()
      await store.loadMergeCandidates()

      expect(store.error).toBe('timeout')
      expect(store.mergeCandidatesLoading).toBe(false)
    })

    it('falls back to generic message for non-Error rejection', async () => {
      const { fetchMergeCandidates } = await import('@/api/entities')
      vi.mocked(fetchMergeCandidates).mockRejectedValue({ code: 500 })

      const store = useEntitiesStore()
      await store.loadMergeCandidates()

      expect(store.error).toBe('Failed to load merge candidates')
      expect(store.mergeCandidatesLoading).toBe(false)
    })
  })

  describe('dismissMergeCandidate', () => {
    it('calls resolveMergeCandidate with dismissed, filters candidate out, decrements total', async () => {
      const { resolveMergeCandidate } = await import('@/api/entities')
      vi.mocked(resolveMergeCandidate).mockResolvedValue({
        id: 5,
        status: 'dismissed',
      })

      const store = useEntitiesStore()
      store.mergeCandidates = [
        {
          id: 5,
          entity_a: {
            id: 1,
            entity_type: 'person',
            canonical_name: 'A',
            aliases: [],
            mention_count: 1,
            first_seen: '',
            last_seen: '',
          },
          entity_b: {
            id: 2,
            entity_type: 'person',
            canonical_name: 'B',
            aliases: [],
            mention_count: 1,
            first_seen: '',
            last_seen: '',
          },
          similarity: 0.9,
          status: 'pending',
          extraction_run_id: 'run-1',
          created_at: '',
        },
      ]
      store.mergeCandidatesTotal = 1

      await store.dismissMergeCandidate(5)

      expect(resolveMergeCandidate).toHaveBeenCalledWith(5, 'dismissed')
      expect(store.mergeCandidates).toHaveLength(0)
      expect(store.mergeCandidatesTotal).toBe(0)
    })
  })

  describe('acceptMergeCandidate', () => {
    it('calls resolveMergeCandidate with accepted, filters candidate out, decrements total', async () => {
      const { resolveMergeCandidate } = await import('@/api/entities')
      vi.mocked(resolveMergeCandidate).mockResolvedValue({
        id: 6,
        status: 'accepted',
      })

      const store = useEntitiesStore()
      store.mergeCandidates = [
        {
          id: 6,
          entity_a: {
            id: 10,
            entity_type: 'place',
            canonical_name: 'X',
            aliases: [],
            mention_count: 1,
            first_seen: '',
            last_seen: '',
          },
          entity_b: {
            id: 11,
            entity_type: 'place',
            canonical_name: 'Y',
            aliases: [],
            mention_count: 1,
            first_seen: '',
            last_seen: '',
          },
          similarity: 0.85,
          status: 'pending',
          extraction_run_id: 'run-2',
          created_at: '',
        },
        {
          id: 7,
          entity_a: {
            id: 12,
            entity_type: 'person',
            canonical_name: 'Z',
            aliases: [],
            mention_count: 1,
            first_seen: '',
            last_seen: '',
          },
          entity_b: {
            id: 13,
            entity_type: 'person',
            canonical_name: 'W',
            aliases: [],
            mention_count: 1,
            first_seen: '',
            last_seen: '',
          },
          similarity: 0.88,
          status: 'pending',
          extraction_run_id: 'run-2',
          created_at: '',
        },
      ]
      store.mergeCandidatesTotal = 2

      await store.acceptMergeCandidate(6)

      expect(resolveMergeCandidate).toHaveBeenCalledWith(6, 'accepted')
      expect(store.mergeCandidates).toHaveLength(1)
      expect(store.mergeCandidates[0].id).toBe(7)
      expect(store.mergeCandidatesTotal).toBe(1)
    })
  })

  describe('quarantine', () => {
    it('loadQuarantined populates the list and clears the loading flag', async () => {
      const { fetchQuarantinedEntities } = await import('@/api/entities')
      vi.mocked(fetchQuarantinedEntities).mockResolvedValue({
        items: [
          {
            id: 9,
            entity_type: 'person',
            canonical_name: 'Suspicious',
            aliases: [],
            mention_count: 0,
            first_seen: '2026-01-01',
            last_seen: '',
            is_quarantined: true,
            quarantine_reason: 'noisy',
            quarantined_at: '2026-04-01T00:00:00Z',
          },
        ],
        total: 1,
      })

      const store = useEntitiesStore()
      await store.loadQuarantined()

      expect(store.quarantinedEntities).toHaveLength(1)
      expect(store.quarantinedEntities[0].canonical_name).toBe('Suspicious')
      expect(store.quarantinedLoading).toBe(false)
    })

    it('loadQuarantined sets error on failure', async () => {
      const { fetchQuarantinedEntities } = await import('@/api/entities')
      vi.mocked(fetchQuarantinedEntities).mockRejectedValue(new Error('boom'))

      const store = useEntitiesStore()
      await store.loadQuarantined()

      expect(store.error).toBe('boom')
      expect(store.quarantinedLoading).toBe(false)
    })

    it('loadQuarantined falls back to a generic message for non-Error rejection', async () => {
      const { fetchQuarantinedEntities } = await import('@/api/entities')
      vi.mocked(fetchQuarantinedEntities).mockRejectedValue('plain')

      const store = useEntitiesStore()
      await store.loadQuarantined()

      expect(store.error).toBe('Failed to load quarantined entities')
    })

    it('releaseEntityQuarantine drops the entity from the quarantined list and clears the banner on the open entity', async () => {
      const { releaseQuarantine } = await import('@/api/entities')
      vi.mocked(releaseQuarantine).mockResolvedValue({
        id: 9,
        entity_type: 'person',
        canonical_name: 'Suspicious',
        description: '',
        aliases: [],
        first_seen: '2026-01-01',
        created_at: '',
        updated_at: '',
        is_quarantined: false,
        quarantine_reason: '',
        quarantined_at: '',
      })

      const store = useEntitiesStore()
      store.quarantinedEntities = [
        {
          id: 9,
          entity_type: 'person',
          canonical_name: 'Suspicious',
          aliases: [],
          mention_count: 0,
          first_seen: '2026-01-01',
          last_seen: '',
          is_quarantined: true,
          quarantine_reason: 'noisy',
          quarantined_at: '2026-04-01T00:00:00Z',
        },
        {
          id: 10,
          entity_type: 'person',
          canonical_name: 'Other',
          aliases: [],
          mention_count: 0,
          first_seen: '',
          last_seen: '',
          is_quarantined: true,
          quarantine_reason: 'x',
          quarantined_at: '',
        },
      ]
      store.currentEntity = {
        id: 9,
        entity_type: 'person',
        canonical_name: 'Suspicious',
        description: '',
        aliases: [],
        first_seen: '2026-01-01',
        created_at: '',
        updated_at: '',
        is_quarantined: true,
        quarantine_reason: 'noisy',
        quarantined_at: '2026-04-01T00:00:00Z',
      }

      await store.releaseEntityQuarantine(9)

      expect(releaseQuarantine).toHaveBeenCalledWith(9)
      expect(store.quarantinedEntities.map((e) => e.id)).toEqual([10])
      // Banner state on the currently-open entity is flipped off
      // so the UI updates without a refetch.
      expect(store.currentEntity?.is_quarantined).toBe(false)
      expect(store.currentEntity?.quarantine_reason).toBe('')
      expect(store.currentEntity?.quarantined_at).toBe('')
    })

    it('releaseEntityQuarantine surfaces and re-throws API errors', async () => {
      const { releaseQuarantine } = await import('@/api/entities')
      vi.mocked(releaseQuarantine).mockRejectedValue(new Error('nope'))

      const store = useEntitiesStore()
      await expect(store.releaseEntityQuarantine(1)).rejects.toThrow('nope')
      expect(store.error).toBe('nope')
    })

    it('releaseEntityQuarantine falls back to a generic message for non-Error rejection', async () => {
      const { releaseQuarantine } = await import('@/api/entities')
      vi.mocked(releaseQuarantine).mockRejectedValue('plain')

      const store = useEntitiesStore()
      await expect(store.releaseEntityQuarantine(1)).rejects.toBeDefined()
      expect(store.error).toBe('Failed to release quarantine')
    })
  })
})
