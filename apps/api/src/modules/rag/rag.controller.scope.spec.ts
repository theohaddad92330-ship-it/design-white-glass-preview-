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

/**
 * #1954.22 — CHANGER la portée d'un document déjà attaché.
 *
 * Même patron que `rag.controller.remove.spec.ts` (#1954.20) : l'auteur vient
 * du jeton, l'espace est résolu côté serveur, jamais lus du corps.
 */
describe('RagController — PATCH /rag-documents/:id/scope (#1954.22)', () => {
  const user = { userId: 'u-1' } as CurrentUserPayload

  function build(updateScopeForUser: jest.Mock) {
    const resolveActiveWorkspace = jest.fn().mockResolvedValue({ workspaceId: 'ws-1' })
    const controller = new RagController(
      { updateScopeForUser } as unknown as RagService,
      {} as IaClient,
      { resolveActiveWorkspace } as unknown as WorkspaceContextService,
      {} as RagZipIngestJobService,
      {} as ImportService,
      {} as ImportWriterService,
    )
    return { controller, resolveActiveWorkspace }
  }

  it('scopes the update to the JWT author AND the active workspace resolved server-side', async () => {
    const updateScopeForUser = jest.fn().mockResolvedValue(success())
    const { controller, resolveActiveWorkspace } = build(updateScopeForUser)

    await controller.updateScope('doc-1', { scope: 'workspace' }, user)

    expect(resolveActiveWorkspace).toHaveBeenCalledWith('u-1')
    expect(updateScopeForUser).toHaveBeenCalledWith('doc-1', 'u-1', 'ws-1', 'workspace', null, null)
  })

  it('porte le conversationId du corps quand la portée redevient `conversation`', async () => {
    const updateScopeForUser = jest.fn().mockResolvedValue(success())
    const { controller } = build(updateScopeForUser)

    await controller.updateScope('doc-1', { scope: 'conversation', conversationId: 'thread-A' }, user)

    expect(updateScopeForUser).toHaveBeenCalledWith('doc-1', 'u-1', 'ws-1', 'conversation', 'thread-A', null)
  })

  it('answers 404 when nothing matched for this author in this workspace', async () => {
    const updateScopeForUser = jest
      .fn()
      .mockResolvedValue(failure({ code: 'not_found', message: 'Document introuvable' }))
    const { controller } = build(updateScopeForUser)

    await expect(controller.updateScope('doc-1', { scope: 'workspace' }, user)).rejects.toBeInstanceOf(
      NotFoundException,
    )
  })

  it('answers 400 when `conversation` is requested without a conversationId', async () => {
    const updateScopeForUser = jest
      .fn()
      .mockResolvedValue(failure({ code: 'scope_requires_conversation', message: 'Un fil est requis.' }))
    const { controller } = build(updateScopeForUser)

    await expect(controller.updateScope('doc-1', { scope: 'conversation' }, user)).rejects.toBeInstanceOf(
      BadRequestException,
    )
  })
})
