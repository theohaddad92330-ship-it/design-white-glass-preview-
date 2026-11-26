import { createHash } from 'node:crypto'
import { EMAIL_ATTACHMENT_MAX_TOTAL_BYTES } from '@bellum/contracts'
import { EmailAttachmentService } from './email-attachment.service'
import { OutreachAssetEntity } from '../../database/entities/outreach-asset.entity'
import { createMockRepository, type MockRepository } from '../../database/test-utils'

const PDF = Buffer.from('%PDF-1.4 fichier fictif')
const sha = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex')
const ID_A = '11111111-1111-4111-8111-111111111111'
const ID_B = '22222222-2222-4222-8222-222222222222'

function asset(overrides: Partial<OutreachAssetEntity> = {}): OutreachAssetEntity {
  return {
    id: ID_A,
    workspace_id: 'ws-1',
    user_id: 'u-1',
    title: 'Plaquette',
    description: null,
    category: 'company_brochure',
    usage_rights: 'always',
    storage_object_id: 'obj-a',
    created_at: new Date('2026-10-01T00:00:00Z'),
    updated_at: new Date('2026-10-01T00:00:00Z'),
    ...overrides,
  }
}

describe('EmailAttachmentService (#3699.6)', () => {
  let assets: MockRepository<OutreachAssetEntity>
  let storage: { byIds: jest.Mock; readOutreachAssetFile: jest.Mock }
  let query: jest.Mock
  let service: EmailAttachmentService

  beforeEach(() => {
    assets = createMockRepository<OutreachAssetEntity>()
    query = jest.fn(async () => [])
    ;(assets as unknown as { manager: unknown }).manager = { query }
    storage = {
      byIds: jest.fn(async () => new Map()),
      readOutreachAssetFile: jest.fn(async () => ({
        bytes: PDF,
        fileName: 'plaquette.pdf',
        contentType: 'application/pdf',
        byteSize: PDF.byteLength,
        sha256: sha(PDF),
      })),
    }
    service = new EmailAttachmentService(assets as never, storage as never)
  })

  describe('resolveForSend', () => {
    it('relit les octets et rend nom, type rangé, base64, taille et empreinte', async () => {
      assets.find.mockResolvedValueOnce([asset()])
      const result = await service.resolveForSend('ws-1', 'c-1', [ID_A])
      expect(result.type).toBe('success')
      if (result.type === 'success') {
        expect(result.output).toEqual([
          {
            fileName: 'plaquette.pdf',
            contentType: 'application/pdf',
            contentBase64: PDF.toString('base64'),
            byteSize: PDF.byteLength,
            sha256: sha(PDF),
          },
        ])
      }
      expect(storage.readOutreachAssetFile).toHaveBeenCalledWith('ws-1', 'obj-a')
      expect(assets.find).toHaveBeenCalledWith({ where: [{ id: ID_A, workspace_id: 'ws-1' }] })
    })

    it('SAIT DIRE NON — un asset d’un autre espace est introuvable, aucun octet relu', async () => {
      assets.find.mockResolvedValueOnce([])
      const result = await service.resolveForSend('ws-1', 'c-1', [ID_A])
      expect(result.type).toBe('failure')
      expect(storage.readOutreachAssetFile).not.toHaveBeenCalled()
    })

    it('refuse un asset sans fichier', async () => {
      assets.find.mockResolvedValueOnce([asset({ storage_object_id: null })])
      expect((await service.resolveForSend('ws-1', 'c-1', [ID_A])).type).toBe('failure')
    })

    it('« après intérêt confirmé » : refusé sans réponse positive, accepté avec', async () => {
      assets.find.mockResolvedValue([asset({ usage_rights: 'after_interest_confirmed' })])
      const blocked = await service.resolveForSend('ws-1', 'c-1', [ID_A])
      expect(blocked.type).toBe('failure')
      if (blocked.type === 'failure') expect(blocked.problem.message).toContain('intérêt confirmé')
      expect(query.mock.calls[0]?.[1]).toEqual(['c-1', 'ws-1'])

      query.mockResolvedValueOnce([{ found: 1 }])
      expect((await service.resolveForSend('ws-1', 'c-1', [ID_A])).type).toBe('success')
    })

    it('refuse des octets dont la signature ne correspond pas à l’extension', async () => {
      assets.find.mockResolvedValueOnce([asset()])
      const exe = Buffer.from('MZ\u0000\u0000binaire')
      storage.readOutreachAssetFile.mockResolvedValueOnce({
        bytes: exe,
        fileName: 'plaquette.pdf',
        contentType: 'application/pdf',
        byteSize: exe.byteLength,
        sha256: sha(exe),
      })
      expect((await service.resolveForSend('ws-1', 'c-1', [ID_A])).type).toBe('failure')
    })

    it('refuse un fichier altéré depuis son dépôt (empreinte divergente)', async () => {
      assets.find.mockResolvedValueOnce([asset()])
      storage.readOutreachAssetFile.mockResolvedValueOnce({
        bytes: PDF,
        fileName: 'plaquette.pdf',
        contentType: 'application/pdf',
        byteSize: PDF.byteLength,
        sha256: 'f'.repeat(64),
      })
      expect((await service.resolveForSend('ws-1', 'c-1', [ID_A])).type).toBe('failure')
    })

    it('refuse au-delà de la taille totale du réglage unique', async () => {
      const big = Buffer.concat([Buffer.from('%PDF'), Buffer.alloc(EMAIL_ATTACHMENT_MAX_TOTAL_BYTES)])
      assets.find.mockResolvedValueOnce([asset()])
      storage.readOutreachAssetFile.mockResolvedValueOnce({
        bytes: big,
        fileName: 'plaquette.pdf',
        contentType: 'application/pdf',
        byteSize: big.byteLength,
        sha256: null,
      })
      const result = await service.resolveForSend('ws-1', 'c-1', [ID_A])
      expect(result.type).toBe('failure')
      if (result.type === 'failure') expect(result.problem.message).toContain('Mo')
    })

    it('un fichier illisible refuse l’envoi (jamais un envoi sans la pièce)', async () => {
      assets.find.mockResolvedValueOnce([asset()])
      storage.readOutreachAssetFile.mockRejectedValueOnce(new Error('magasin indisponible'))
      expect((await service.resolveForSend('ws-1', 'c-1', [ID_A])).type).toBe('failure')
    })

    it('aucune pièce demandée : aucune lecture', async () => {
      const result = await service.resolveForSend('ws-1', 'c-1', [])
      expect(result).toEqual({ type: 'success', output: [] })
      expect(assets.find).not.toHaveBeenCalled()
    })
  })

  describe('attachableFor', () => {
    it('ne liste que les assets qui portent un fichier rangé, et NOMME celui que le droit d’usage retient', async () => {
      assets.find.mockResolvedValueOnce([
        asset(),
        asset({ id: ID_B, title: 'CV', usage_rights: 'after_interest_confirmed', storage_object_id: 'obj-b' }),
        asset({ id: '33333333-3333-4333-8333-333333333333', storage_object_id: 'obj-gone' }),
      ])
      storage.byIds.mockResolvedValueOnce(
        new Map([
          ['obj-a', { fileName: 'plaquette.pdf', contentType: 'application/pdf', byteSize: 10 }],
          ['obj-b', { fileName: 'cv.pdf', contentType: 'application/pdf', byteSize: 20 }],
        ]),
      )
      const documents = await service.attachableFor('ws-1', 'c-1')
      expect(documents).toEqual([
        {
          asset_id: ID_A,
          title: 'Plaquette',
          file_name: 'plaquette.pdf',
          content_type: 'application/pdf',
          byte_size: 10,
          blocked_reason: null,
        },
        {
          asset_id: ID_B,
          title: 'CV',
          file_name: 'cv.pdf',
          content_type: 'application/pdf',
          byte_size: 20,
          blocked_reason: 'interest_not_confirmed',
        },
      ])
    })
  })
})
