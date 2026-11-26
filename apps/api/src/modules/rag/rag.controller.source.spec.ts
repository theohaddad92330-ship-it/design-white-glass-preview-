import { NotFoundException, StreamableFile } from '@nestjs/common'
import { failure, success } from '@bellum/utils'
import type { CurrentUserPayload } from '../../common/decorator/current-user.decorator'
import type { IaClient } from '../ia/ia.client'
import type { WorkspaceContextService } from '../workspace/workspace-context.service'
import type { ImportService } from '../import/import.service'
import type { ImportWriterService } from '../import/import-writer.service'
import type { StorageService } from '../storage/storage.service'
import { RagController } from './rag.controller'
import type { RagService } from './rag.service'
import type { RagZipIngestJobService } from './rag-zip-ingest-job.service'

/**
 * #3803 — l'ORIGINAL d'un document : conservé au dépôt, lu par la
 * visionneuse, téléchargé, et parti avec le document.
 */
describe('RagController — original d’un document (#3803)', () => {
  const user = { userId: 'u-1' } as CurrentUserPayload
  const PDF_B64 = Buffer.from('%PDF-1.4 offre').toString('base64')

  function build(
    over: {
      rag?: Partial<Record<keyof RagService, jest.Mock>>
      storage?: Record<string, jest.Mock>
      demo?: boolean
    } = {},
  ) {
    const resolveActiveWorkspace = jest.fn().mockResolvedValue({ workspaceId: 'ws-1' })
    const ia = { ragIngest: jest.fn().mockResolvedValue({ data: { id: 'doc-new' } }) }
    const rag = {
      accountInWorkspace: jest.fn().mockResolvedValue(true),
      attachSource: jest.fn().mockResolvedValue(true),
      sourceObjectIdForReader: jest.fn().mockResolvedValue(success('obj-1')),
      deleteForUser: jest.fn().mockResolvedValue(success({ sourceObjectId: 'obj-1' })),
      ...over.rag,
    }
    const storage = {
      put: jest.fn().mockResolvedValue({ id: 'obj-new' }),
      remove: jest.fn().mockResolvedValue(undefined),
      readRagDocumentSource: jest
        .fn()
        .mockResolvedValue({ bytes: Buffer.from('%PDF'), fileName: 'offre.pdf', contentType: 'application/pdf' }),
      signedUrlFor: jest.fn().mockResolvedValue({ url: 'https://x/y', expiresAt: 'z', fileName: 'offre.pdf' }),
      ...over.storage,
    }
    const controller = new RagController(
      rag as unknown as RagService,
      ia as unknown as IaClient,
      {
        resolveActiveWorkspace,
        isDemoWorkspace: jest.fn().mockResolvedValue(Boolean(over.demo)),
      } as unknown as WorkspaceContextService,
      {} as RagZipIngestJobService,
      {} as ImportService,
      {} as ImportWriterService,
      storage as unknown as StorageService,
    )
    return { controller, rag, storage, ia }
  }

  it('3803.1 — range l’original APRÈS l’ingestion, sous `rag_document_source`, et le lie au document', async () => {
    const { controller, rag, storage } = build()
    await controller.ingest(user, { title: 'Offre', fileB64: PDF_B64, filename: 'offre.pdf' } as never)
    expect(storage.put).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: 'ws-1',
        domain: 'rag_document_source',
        fileName: 'offre.pdf',
        fileB64: PDF_B64,
        uploadedBy: 'u-1',
      }),
    )
    expect(rag.attachSource).toHaveBeenCalledWith('doc-new', 'ws-1', 'obj-new')
  })

  it('3803.1 — un texte déposé (csv) garde aussi son original : son texte, réencodé', async () => {
    const { controller, storage } = build()
    await controller.ingest(user, { title: 'Export', content: 'a;b\n1;2', filename: 'export.csv' } as never)
    const call = storage.put.mock.calls[0]?.[0] as { fileB64: string; fileName: string }
    expect(call.fileName).toBe('export.csv')
    expect(Buffer.from(call.fileB64, 'base64').toString('utf8')).toBe('a;b\n1;2')
  })

  it('3803.1 — un lien refusé (doublon déjà pourvu) n’abandonne pas d’octets : l’objet repart', async () => {
    const { controller, storage } = build({ rag: { attachSource: jest.fn().mockResolvedValue(false) } })
    await controller.ingest(user, { title: 'Offre', fileB64: PDF_B64, filename: 'offre.pdf' } as never)
    expect(storage.remove).toHaveBeenCalledWith('ws-1', 'obj-new')
  })

  it('3803.1 — un stockage en échec ne fait JAMAIS échouer l’ingestion (best-effort)', async () => {
    const { controller } = build({ storage: { put: jest.fn().mockRejectedValue(new Error('quota')) } })
    await expect(
      controller.ingest(user, { title: 'Offre', fileB64: PDF_B64, filename: 'offre.pdf' } as never),
    ).resolves.toEqual({ data: { id: 'doc-new' } })
  })

  it('3803.2 — sert les octets d’un document LISIBLE, lus dans l’espace de la session', async () => {
    const { controller, rag, storage } = build()
    const file = await controller.downloadSource('doc-1', user)
    expect(rag.sourceObjectIdForReader).toHaveBeenCalledWith('doc-1', 'u-1', 'ws-1')
    expect(storage.readRagDocumentSource).toHaveBeenCalledWith('ws-1', 'obj-1')
    expect(file).toBeInstanceOf(StreamableFile)
  })

  it('3803.5 — un document d’un AUTRE espace (ou sans original) : 404, et le magasin n’est pas lu', async () => {
    const { controller, storage } = build({
      rag: { sourceObjectIdForReader: jest.fn().mockResolvedValue(failure({ code: 'not_found', message: 'x' })) },
    })
    await expect(controller.downloadSource('doc-1', user)).rejects.toBeInstanceOf(NotFoundException)
    await expect(controller.sourceLink('doc-1', user)).rejects.toBeInstanceOf(NotFoundException)
    expect(storage.readRagDocumentSource).not.toHaveBeenCalled()
    expect(storage.signedUrlFor).not.toHaveBeenCalled()
  })

  it('3803.5 — « Télécharger l’original » : une URL signée courte, jamais un chemin', async () => {
    const { controller, storage } = build()
    await expect(controller.sourceLink('doc-1', user)).resolves.toMatchObject({ url: 'https://x/y' })
    expect(storage.signedUrlFor).toHaveBeenCalledWith('ws-1', 'obj-1')
  })

  it('3803.1 — supprimer le document emporte son original', async () => {
    const { controller, storage } = build()
    await controller.remove('doc-1', user)
    expect(storage.remove).toHaveBeenCalledWith('ws-1', 'obj-1')
  })
})
