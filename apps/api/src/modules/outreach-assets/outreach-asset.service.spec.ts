import { EMAIL_ATTACHMENT_MAX_TOTAL_BYTES } from '@bellum/contracts'
import { OutreachAssetService } from './outreach-asset.service'
import { OutreachAssetEntity } from '../../database/entities/outreach-asset.entity'
import { DEFAULT_OUTREACH_ASSETS } from './default-outreach-assets'
import { createMockRepository, type MockRepository } from '../../database/test-utils'

function row(overrides: Partial<OutreachAssetEntity> = {}): OutreachAssetEntity {
  return {
    id: 'asset-1',
    workspace_id: 'ws-1',
    user_id: 'user-1',
    title: 'T',
    description: null,
    category: 'other',
    usage_rights: 'always',
    storage_object_id: null,
    created_at: new Date('2026-01-01T00:00:00.000Z'),
    updated_at: new Date('2026-01-02T00:00:00.000Z'),
    ...overrides,
  }
}

describe('OutreachAssetService', () => {
  let service: OutreachAssetService
  let assets: MockRepository<OutreachAssetEntity>
  let storage: { byIds: jest.Mock; put: jest.Mock; remove: jest.Mock }

  beforeEach(() => {
    assets = createMockRepository<OutreachAssetEntity>()
    storage = { byIds: jest.fn(async () => new Map()), put: jest.fn(), remove: jest.fn(async () => undefined) }
    service = new OutreachAssetService(assets as never, storage as never)
  })

  describe('listForWorkspace', () => {
    it('seeds the starter catalog the first time a workspace is read (empty)', async () => {
      assets.count.mockResolvedValueOnce(0)
      assets.find.mockResolvedValueOnce([row()])

      const result = await service.listForWorkspace('ws-1', 'user-1')

      expect(assets.save).toHaveBeenCalledTimes(1)
      const seeded = assets.save.mock.calls[0]![0] as OutreachAssetEntity[]
      expect(seeded).toHaveLength(DEFAULT_OUTREACH_ASSETS.length)
      expect(seeded.every(s => s.workspace_id === 'ws-1' && s.user_id === 'user-1')).toBe(true)
      expect(assets.find).toHaveBeenCalledWith(
        expect.objectContaining({ where: { workspace_id: 'ws-1' }, order: { created_at: 'ASC' } }),
      )
      expect(result).toHaveLength(1)
      expect(result[0]).toMatchObject({ id: 'asset-1', category: 'other', usageRights: 'always' })
    })

    it('does not seed when the workspace already has assets', async () => {
      assets.count.mockResolvedValueOnce(3)
      assets.find.mockResolvedValueOnce([])

      await service.listForWorkspace('ws-1', 'user-1')

      expect(assets.save).not.toHaveBeenCalled()
    })

    it('scopes the read to the caller workspace, never another one', async () => {
      assets.count.mockResolvedValueOnce(1)
      assets.find.mockResolvedValueOnce([])

      await service.listForWorkspace('ws-1', 'user-1')

      expect(assets.find).toHaveBeenCalledWith(expect.objectContaining({ where: { workspace_id: 'ws-1' } }))
    })

    it('maps entity rows to the wire shape with ISO timestamps', async () => {
      assets.count.mockResolvedValueOnce(1)
      assets.find.mockResolvedValueOnce([row()])

      const [asset] = await service.listForWorkspace('ws-1', 'user-1')

      expect(asset).toEqual({
        id: 'asset-1',
        title: 'T',
        description: null,
        category: 'other',
        usageRights: 'always',
        file: null,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-02T00:00:00.000Z',
      })
    })
  })

  describe('create', () => {
    it('stamps user_id + workspace_id from the caller (never the body)', async () => {
      assets.save.mockImplementationOnce(async (e: OutreachAssetEntity) => row({ ...e, id: 'new-1' }))

      const result = await service.create('ws-1', 'user-1', {
        title: 'Nouveau',
        category: 'case_study',
        usageRights: 'after_interest_confirmed',
      })

      expect(assets.create).toHaveBeenCalledWith(
        expect.objectContaining({
          user_id: 'user-1',
          workspace_id: 'ws-1',
          title: 'Nouveau',
          category: 'case_study',
          usage_rights: 'after_interest_confirmed',
        }),
      )
      expect(result.type).toBe('success')
    })
  })

  describe('update', () => {
    it('updates only the provided fields on a workspace-scoped row', async () => {
      const existing = row({ title: 'Old', category: 'resume' })
      assets.findOne.mockResolvedValueOnce(existing)
      assets.save.mockImplementationOnce(async (e: OutreachAssetEntity) => e)

      const result = await service.update('asset-1', 'ws-1', { title: 'New' })

      expect(assets.findOne).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'asset-1', workspace_id: 'ws-1' } }),
      )
      expect(result.type).toBe('success')
      if (result.type === 'success') expect(result.output.title).toBe('New')
      expect(existing.category).toBe('resume')
    })

    it('returns not_found — without writing — when the asset is not in the caller workspace', async () => {
      assets.findOne.mockResolvedValueOnce(null)
      const result = await service.update('ghost', 'other-ws', { title: 'x' })
      expect(result.type).toBe('failure')
      if (result.type === 'failure') expect(result.problem.code).toBe('not_found')
      expect(assets.save).not.toHaveBeenCalled()
    })
  })

  describe('delete', () => {
    it('deletes a workspace-scoped row', async () => {
      assets.findOne.mockResolvedValueOnce(row())
      const result = await service.delete('asset-1', 'ws-1')
      expect(result.type).toBe('success')
      expect(assets.delete).toHaveBeenCalledWith({ id: 'asset-1', workspace_id: 'ws-1' })
    })

    it('returns not_found — without writing — when the asset belongs to another workspace', async () => {
      assets.findOne.mockResolvedValueOnce(null)
      const result = await service.delete('asset-1', 'other-ws')
      expect(result.type).toBe('failure')
      if (result.type === 'failure') expect(result.problem.code).toBe('not_found')
      expect(assets.delete).not.toHaveBeenCalled()
    })
  })
})

// #3699.6 — la bibliothèque de documents attachables : le fichier RÉEL d'un asset.
describe('OutreachAssetService — fichier d’un asset (#3699.6)', () => {
  let service: OutreachAssetService
  let assets: MockRepository<OutreachAssetEntity>
  let storage: { byIds: jest.Mock; put: jest.Mock; remove: jest.Mock }
  const stored = {
    id: 'obj-new',
    fileName: 'plaquette.pdf',
    contentType: 'application/pdf',
    byteSize: 1234,
    retentionUntil: '9999-12-31',
    uploadedAt: '2026-10-09T00:00:00.000Z',
    contentSha256: 'ab'.repeat(32),
  }
  const upload = { fileName: 'plaquette.pdf', contentType: 'application/pdf', fileB64: 'JVBERi0=' }

  beforeEach(() => {
    assets = createMockRepository<OutreachAssetEntity>()
    storage = {
      byIds: jest.fn(async () => new Map()),
      put: jest.fn(async () => stored),
      remove: jest.fn(async () => undefined),
    }
    service = new OutreachAssetService(assets as never, storage as never)
  })

  it('range le fichier dans le domaine outreach_asset_file, borné à l’espace, et le rend sans chemin', async () => {
    assets.findOne.mockResolvedValueOnce(row())
    assets.save.mockImplementation(async (entity: unknown) => entity)
    const result = await service.attachFile('asset-1', 'ws-1', 'user-1', upload, '2026-10-09')
    expect(storage.put).toHaveBeenCalledWith(
      expect.objectContaining({ workspaceId: 'ws-1', domain: 'outreach_asset_file', uploadedBy: 'user-1' }),
    )
    expect(assets.findOne).toHaveBeenCalledWith({ where: { id: 'asset-1', workspace_id: 'ws-1' } })
    expect(result.type === 'success' && result.output.file).toEqual({
      fileName: 'plaquette.pdf',
      contentType: 'application/pdf',
      byteSize: 1234,
      sha256: 'ab'.repeat(32),
    })
    expect(JSON.stringify(result)).not.toContain('obj-new')
  })

  it('SAIT DIRE NON — l’asset d’un autre espace n’existe pas ici, aucun octet n’est rangé', async () => {
    assets.findOne.mockResolvedValueOnce(null)
    const result = await service.attachFile('asset-1', 'ws-2', 'user-1', upload, '2026-10-09')
    expect(result.type).toBe('failure')
    expect(storage.put).not.toHaveBeenCalled()
  })

  it('SAIT DIRE NON — un document plus lourd que la borne d’un e-mail est refusé AVANT tout octet rangé', async () => {
    assets.findOne.mockResolvedValueOnce(row())
    const heavy = Buffer.alloc(EMAIL_ATTACHMENT_MAX_TOTAL_BYTES + 1).toString('base64')
    const result = await service.attachFile('asset-1', 'ws-1', 'user-1', { ...upload, fileB64: heavy }, '2026-10-09')
    expect(result.type === 'failure' && result.problem.code).toBe('file_too_large')
    expect(storage.put).not.toHaveBeenCalled()
  })

  it('un fichier remplacé PART du stockage', async () => {
    assets.findOne.mockResolvedValueOnce(row({ storage_object_id: 'obj-old' }))
    assets.save.mockImplementation(async (entity: unknown) => entity)
    await service.attachFile('asset-1', 'ws-1', 'user-1', upload, '2026-10-09')
    expect(storage.remove).toHaveBeenCalledWith('ws-1', 'obj-old')
  })

  it('une ligne qui ne prend pas fait repartir les octets neufs, l’ancien reste', async () => {
    assets.findOne.mockResolvedValueOnce(row({ storage_object_id: 'obj-old' }))
    assets.save.mockRejectedValueOnce(new Error('db down'))
    const result = await service.attachFile('asset-1', 'ws-1', 'user-1', upload, '2026-10-09')
    expect(result.type).toBe('failure')
    expect(storage.remove).toHaveBeenCalledWith('ws-1', 'obj-new')
    expect(storage.remove).not.toHaveBeenCalledWith('ws-1', 'obj-old')
  })

  it('retirer le fichier garde l’asset, sans fichier ; sans fichier, le retrait est refusé', async () => {
    assets.findOne.mockResolvedValueOnce(row({ storage_object_id: 'obj-old' }))
    assets.save.mockImplementation(async (entity: unknown) => entity)
    const removed = await service.detachFile('asset-1', 'ws-1')
    expect(removed.type === 'success' && removed.output.file).toBeNull()
    expect(storage.remove).toHaveBeenCalledWith('ws-1', 'obj-old')

    assets.findOne.mockResolvedValueOnce(row())
    const none = await service.detachFile('asset-1', 'ws-1')
    expect(none.type).toBe('failure')
  })

  it('la liste joint le fichier réellement rangé, et rien pour un objet absent', async () => {
    assets.count.mockResolvedValueOnce(2)
    assets.find.mockResolvedValueOnce([
      row({ id: 'a1', storage_object_id: 'obj-1' }),
      row({ id: 'a2', storage_object_id: 'obj-gone' }),
    ])
    storage.byIds.mockResolvedValueOnce(new Map([['obj-1', stored]]))
    const [first, second] = await service.listForWorkspace('ws-1', 'user-1')
    expect(storage.byIds).toHaveBeenCalledWith('ws-1', ['obj-1', 'obj-gone'])
    expect(first?.file?.fileName).toBe('plaquette.pdf')
    expect(second?.file).toBeNull()
  })

  it('supprimer l’asset emporte son fichier', async () => {
    assets.findOne.mockResolvedValueOnce(row({ storage_object_id: 'obj-old' }))
    await service.delete('asset-1', 'ws-1')
    expect(storage.remove).toHaveBeenCalledWith('ws-1', 'obj-old')
  })
})
