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
 * #1954.20 — « retirer » une pièce jointe du chat SUPPRIME le document ingéré.
 *
 * L'écran du chat et « Connaissances » appellent la même route. Elle ne lit
 * rien du corps : l'auteur vient du jeton, l'espace est résolu côté serveur.
 */
describe('RagController — DELETE /rag-documents/:id (#1954.20)', () => {
  const user = { userId: 'u-1' } as CurrentUserPayload

  function build(deleteForUser: jest.Mock) {
    const resolveActiveWorkspace = jest.fn().mockResolvedValue({ workspaceId: 'ws-1' })
    const controller = new RagController(
      { deleteForUser } as unknown as RagService,
      {} as IaClient,
      { resolveActiveWorkspace } as unknown as WorkspaceContextService,
      {} as RagZipIngestJobService,
      {} as ImportService,
      {} as ImportWriterService,
    )
    return { controller, resolveActiveWorkspace }
  }

  it('scopes the delete to the JWT author AND the active workspace resolved server-side', async () => {
    const deleteForUser = jest.fn().mockResolvedValue(success({ sourceObjectId: null }))
    const { controller, resolveActiveWorkspace } = build(deleteForUser)

    await controller.remove('doc-1', user)

    expect(resolveActiveWorkspace).toHaveBeenCalledWith('u-1')
    expect(deleteForUser).toHaveBeenCalledWith('doc-1', 'u-1', 'ws-1')
  })

  it('answers 404 when nothing matched for this author in this workspace', async () => {
    const deleteForUser = jest.fn().mockResolvedValue(failure({ code: 'not_found', message: 'Document introuvable' }))
    const { controller } = build(deleteForUser)

    await expect(controller.remove('doc-1', user)).rejects.toBeInstanceOf(NotFoundException)
  })
})
