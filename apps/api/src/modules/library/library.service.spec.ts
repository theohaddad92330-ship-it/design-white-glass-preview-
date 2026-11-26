import { LibraryService } from './library.service'
import { LibraryItemEntity } from '../../database/entities/library-item.entity'
import { DEFAULT_LIBRARY_ITEMS } from './default-library'
import { createMockRepository, type MockRepository } from '../../database/test-utils'

function row(overrides: Partial<LibraryItemEntity> = {}): LibraryItemEntity {
  return {
    id: 'item-1',
    user_id: 'user-1',
    workspace_id: 'ws-1',
    kind: 'template',
    title: 'T',
    description: null,
    category: null,
    body: 'body',
    created_at: new Date('2026-01-01T00:00:00.000Z'),
    updated_at: new Date('2026-01-02T00:00:00.000Z'),
    ...overrides,
  }
}

describe('LibraryService', () => {
  let service: LibraryService
  let items: MockRepository<LibraryItemEntity>

  beforeEach(() => {
    items = createMockRepository<LibraryItemEntity>()
    service = new LibraryService(items as never)
  })

  describe('listForWorkspace', () => {
    it('seeds the built-in starter set the first time a workspace is read (empty)', async () => {
      items.count.mockResolvedValueOnce(0)
      items.find.mockResolvedValueOnce([row({ kind: 'template' })])

      const result = await service.listForWorkspace('ws-1', 'user-1', 'template')

      // Seeded exactly the default set, stamped with the caller + workspace.
      // Idempotent: INSERT … ON CONFLICT DO NOTHING, never a bare save().
      expect(items.save).not.toHaveBeenCalled()
      const qb = items.createQueryBuilder.mock.results[0]!.value
      expect(qb.orIgnore).toHaveBeenCalledTimes(1)
      expect(qb.execute).toHaveBeenCalledTimes(1)
      const seeded = qb.values.mock.calls[0]![0] as LibraryItemEntity[]
      expect(seeded).toHaveLength(DEFAULT_LIBRARY_ITEMS.length)
      expect(seeded.every(s => s.workspace_id === 'ws-1' && s.user_id === 'user-1')).toBe(true)
      // Read is scoped to the workspace + requested kind.
      expect(items.find).toHaveBeenCalledWith(
        expect.objectContaining({ where: { workspace_id: 'ws-1', kind: 'template' } }),
      )
      expect(result).toHaveLength(1)
      expect(result[0]).toMatchObject({ id: 'item-1', kind: 'template', body: 'body' })
    })

    it('scopes the read to the requested kind (method_playbook)', async () => {
      items.count.mockResolvedValueOnce(5)
      items.find.mockResolvedValueOnce([row({ kind: 'method_playbook', category: null })])

      const result = await service.listForWorkspace('ws-1', 'user-1', 'method_playbook')

      expect(items.save).not.toHaveBeenCalled()
      expect(items.find).toHaveBeenCalledWith(
        expect.objectContaining({ where: { workspace_id: 'ws-1', kind: 'method_playbook' } }),
      )
      expect(result[0]).toMatchObject({ kind: 'method_playbook' })
    })

    it('does not seed when the workspace already has items', async () => {
      items.count.mockResolvedValueOnce(3)
      items.find.mockResolvedValueOnce([])

      await service.listForWorkspace('ws-1', 'user-1', 'playbook')

      expect(items.save).not.toHaveBeenCalled()
    })

    it('maps entity rows to the wire shape with ISO timestamps', async () => {
      items.count.mockResolvedValueOnce(1)
      items.find.mockResolvedValueOnce([row()])

      const [item] = await service.listForWorkspace('ws-1', 'user-1', 'template')

      expect(item).toEqual({
        id: 'item-1',
        kind: 'template',
        title: 'T',
        description: null,
        category: null,
        body: 'body',
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-02T00:00:00.000Z',
      })
    })
  })

  describe('create', () => {
    it('stamps user_id + workspace_id from the caller (never the body)', async () => {
      items.save.mockImplementationOnce(async (e: LibraryItemEntity) => row({ ...e, id: 'new-1' }))

      const result = await service.create('ws-1', 'user-1', {
        kind: 'playbook',
        title: 'Nouveau',
        body: 'contenu',
      })

      expect(items.create).toHaveBeenCalledWith(
        expect.objectContaining({ user_id: 'user-1', workspace_id: 'ws-1', kind: 'playbook', title: 'Nouveau' }),
      )
      expect(result.type).toBe('success')
    })
  })

  describe('update', () => {
    it('updates only the provided fields on a workspace-scoped row', async () => {
      const existing = row({ title: 'Old', body: 'old' })
      items.findOne.mockResolvedValueOnce(existing)
      items.save.mockImplementationOnce(async (e: LibraryItemEntity) => e)

      const result = await service.update('item-1', 'ws-1', { title: 'New' })

      expect(items.findOne).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'item-1', workspace_id: 'ws-1' } }),
      )
      expect(result.type).toBe('success')
      if (result.type === 'success') expect(result.output.title).toBe('New')
      // body untouched
      expect(existing.body).toBe('old')
    })

    it('returns not_found when the item is not in the caller workspace', async () => {
      items.findOne.mockResolvedValueOnce(null)
      const result = await service.update('ghost', 'ws-1', { title: 'x' })
      expect(result.type).toBe('failure')
      if (result.type === 'failure') expect(result.problem.code).toBe('not_found')
      expect(items.save).not.toHaveBeenCalled()
    })
  })

  describe('delete', () => {
    it('deletes a workspace-scoped row', async () => {
      items.findOne.mockResolvedValueOnce(row())
      const result = await service.delete('item-1', 'ws-1')
      expect(result.type).toBe('success')
      expect(items.delete).toHaveBeenCalledWith({ id: 'item-1', workspace_id: 'ws-1' })
    })

    it('returns not_found when the item does not belong to the workspace', async () => {
      items.findOne.mockResolvedValueOnce(null)
      const result = await service.delete('ghost', 'ws-1')
      expect(result.type).toBe('failure')
      if (result.type === 'failure') expect(result.problem.code).toBe('not_found')
      expect(items.delete).not.toHaveBeenCalled()
    })
  })
})
