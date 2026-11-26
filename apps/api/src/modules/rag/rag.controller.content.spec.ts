import { NotFoundException } from '@nestjs/common'
import { failure, success } from '@bellum/utils'
import type { CurrentUserPayload } from '../../common/decorator/current-user.decorator'
import type { IaClient } from '../ia/ia.client'
import type { WorkspaceContextService } from '../workspace/workspace-context.service'
import { RagController } from './rag.controller'
import type { RagService } from './rag.service'
import type { RagZipIngestJobService } from './rag-zip-ingest-job.service'
import type { ImportService } from '../import/import.service'
import type { ImportWriterService } from '../import/import-writer.service'

/**
 * #1954.19 — PRÉVISUALISER un document déjà attaché.
 *
 * Même patron que `rag.controller.scope.spec.ts` (#1954.22) : l'auteur vient
 * du jeton, l'espace est résolu côté serveur, jamais lus du corps.
 */
describe('RagController — GET /rag-documents/:id (#1954.19)', () => {
  const user = { userId: 'u-1' } as CurrentUserPayload

  function build(getPreviewForReader: jest.Mock) {
    const resolveActiveWorkspace = jest.fn().mockResolvedValue({ workspaceId: 'ws-1' })
    const controller = new RagController(
      { getPreviewForReader } as unknown as RagService,
      {} as IaClient,
      { resolveActiveWorkspace } as unknown as WorkspaceContextService,
      {} as RagZipIngestJobService,
      {} as ImportService,
      {} as ImportWriterService,
    )
    return { controller, resolveActiveWorkspace }
  }

  it('scopes the read to the JWT author AND the active workspace resolved server-side', async () => {
    const doc = { id: 'doc-1', title: 'Grille tarifaire', content: 'Le contenu.', category: 'pricing' }
    const getPreviewForReader = jest.fn().mockResolvedValue(success(doc))
    const { controller, resolveActiveWorkspace } = build(getPreviewForReader)

    const result = await controller.getContent('doc-1', user)

    expect(resolveActiveWorkspace).toHaveBeenCalledWith('u-1')
    expect(getPreviewForReader).toHaveBeenCalledWith('doc-1', 'u-1', 'ws-1')
    expect(result).toEqual(doc)
  })

  it('answers 404 when nothing matched for this author in this workspace', async () => {
    const getPreviewForReader = jest
      .fn()
      .mockResolvedValue(failure({ code: 'not_found', message: 'Document introuvable' }))
    const { controller } = build(getPreviewForReader)

    await expect(controller.getContent('doc-1', user)).rejects.toBeInstanceOf(NotFoundException)
  })
})
