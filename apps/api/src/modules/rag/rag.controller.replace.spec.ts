import { BadRequestException, NotFoundException } from '@nestjs/common'
import { failure, success } from '@bellum/utils'
import type { CurrentUserPayload } from '../../common/decorator/current-user.decorator'
import type { IaClient } from '../ia/ia.client'
import type { WorkspaceContextService } from '../workspace/workspace-context.service'
import { RagController } from './rag.controller'
import type { RagService } from './rag.service'
import type { RagZipIngestJobService } from './rag-zip-ingest-job.service'
import type { ImportService } from '../import/import.service'
import type { ImportWriterService } from '../import/import-writer.service'
import type { RagIngestDto } from '../ia-proxy/dto/ia-proxy.dto'

/**
 * #2431.5 (reste, épopée #2886) — « Remplacer / actualiser » une source déjà
 * importée. Même patron que `rag.controller.proxy.spec.ts` (`ingest`) pour le
 * dépôt du NOUVEAU document, plus la liaison à l'ANCIEN (`RagService.replaceDocument`) :
 * on archive, on ne supprime pas.
 */
describe('RagController — POST /rag-documents/:id/replace (#2431.5)', () => {
  const user = { userId: 'u-1' } as CurrentUserPayload

  function build(overrides: { ragIngestData?: Record<string, unknown>; replaceDocument?: jest.Mock } = {}) {
    const ragIngest = jest.fn().mockResolvedValue({ success: true, data: overrides.ragIngestData ?? { id: 'doc-new' } })
    const resolveActiveWorkspace = jest.fn().mockResolvedValue({ workspaceId: 'ws-1' })
    const isDemoWorkspace = jest.fn().mockResolvedValue(false)
    const replaceDocument = overrides.replaceDocument ?? jest.fn().mockResolvedValue(success())
    const controller = new RagController(
      { replaceDocument } as unknown as RagService,
      { ragIngest } as unknown as IaClient,
      { resolveActiveWorkspace, isDemoWorkspace } as unknown as WorkspaceContextService,
      {} as RagZipIngestJobService,
      {} as ImportService,
      {} as ImportWriterService,
    )
    return { controller, ragIngest, resolveActiveWorkspace, isDemoWorkspace, replaceDocument }
  }

  it('ingère le NOUVEAU document (JWT userId + espace résolu) puis lie l’ANCIEN au nouveau', async () => {
    const { controller, ragIngest, replaceDocument } = build()

    const envelope = await controller.replace(
      'doc-old',
      { title: 'Grille tarifaire v2', content: '...' } as RagIngestDto,
      user,
    )

    expect(ragIngest).toHaveBeenCalledWith({
      userId: 'u-1',
      workspaceId: 'ws-1',
      title: 'Grille tarifaire v2',
      content: '...',
      category: undefined,
      fileB64: undefined,
      filename: undefined,
      scope: undefined,
      conversationId: undefined,
      accountId: undefined,
    })
    expect(replaceDocument).toHaveBeenCalledWith('doc-old', 'u-1', 'ws-1', 'doc-new')
    expect(envelope).toEqual({ success: true, data: { id: 'doc-new' } })
  })

  it('ne lie RIEN quand le dépôt est un doublon du document remplacé lui-même (même contenu, même id)', async () => {
    // `rag_service.ingest` (apps/ia) réutilise l'id EXISTANT sur un contenu
    // identique — dédoublonnage déjà livré (#2431.7). Remplacer par un
    // contenu byte-identique n'a alors rien de neuf à lier : le document
    // « remplacé par lui-même » n'aurait aucun sens.
    const { controller, replaceDocument } = build({ ragIngestData: { id: 'doc-old', duplicate: true } })

    await controller.replace('doc-old', { title: 'Grille tarifaire', content: '...' } as RagIngestDto, user)

    expect(replaceDocument).not.toHaveBeenCalled()
  })

  it('answers 404 when the old document does not belong to this author/workspace', async () => {
    const { controller } = build({
      replaceDocument: jest.fn().mockResolvedValue(failure({ code: 'not_found', message: 'Document introuvable' })),
    })

    await expect(
      controller.replace('doc-old', { title: 'Grille tarifaire v2', content: '...' } as RagIngestDto, user),
    ).rejects.toBeInstanceOf(NotFoundException)
  })

  it('REFUSE le remplacement depuis une salle de démonstration, avant tout dépôt', async () => {
    const { controller, ragIngest, isDemoWorkspace } = build()
    isDemoWorkspace.mockResolvedValue(true)

    await expect(
      controller.replace('doc-old', { title: 'Grille tarifaire v2', content: '...' } as RagIngestDto, user),
    ).rejects.toThrow(/démonstration/)
    expect(ragIngest).not.toHaveBeenCalled()
  })
})
