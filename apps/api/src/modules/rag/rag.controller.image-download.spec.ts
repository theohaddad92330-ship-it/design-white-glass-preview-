import { NotFoundException } from '@nestjs/common'
import type { CurrentUserPayload } from '../../common/decorator/current-user.decorator'
import type { IaClient } from '../ia/ia.client'
import type { StorageService } from '../storage/storage.service'
import { RagController } from './rag.controller'
import type { RagService } from './rag.service'
import type { RagZipIngestJobService } from './rag-zip-ingest-job.service'
import type { WorkspaceContextService } from '../workspace/workspace-context.service'

/**
 * #2876 (#2433.4) — RÉOUVRIR une image de chat rangée : une URL signée de
 * cinq minutes, bornée à l'espace de l'appelant — même porte que
 * `GET chat/messages/:id/voice` (ia-proxy.controller.ts, #1939).
 */
describe('#2876 (#2433.4) — GET rag-documents/image/:objectId', () => {
  const user = { userId: 'u-1' } as CurrentUserPayload

  function build(over: { storage?: boolean; signedUrlFor?: jest.Mock } = {}) {
    const resolveActiveWorkspace = jest.fn().mockResolvedValue({ workspaceId: 'ws-1' })
    const workspaceContext = { resolveActiveWorkspace } as unknown as WorkspaceContextService
    const signedUrlFor =
      over.signedUrlFor ??
      jest.fn().mockResolvedValue({
        url: 'https://signed.example/x',
        expiresAt: '2026-09-28T10:05:00.000Z',
        fileName: 'capture.png',
      })
    const storage = over.storage === false ? undefined : ({ signedUrlFor } as unknown as StorageService)
    const controller = new RagController(
      {} as RagService,
      {} as IaClient,
      workspaceContext,
      {} as RagZipIngestJobService,
      {} as never,
      {} as never,
      storage,
    )
    return { controller, signedUrlFor, resolveActiveWorkspace }
  }

  it('rend une URL signée, bornée à l’espace RÉSOLU de l’appelant', async () => {
    const { controller, signedUrlFor } = build()
    const result = await controller.downloadImage(user, 'img-1')

    expect(signedUrlFor).toHaveBeenCalledWith('ws-1', 'img-1')
    expect(result).toEqual({
      url: 'https://signed.example/x',
      expiresAt: '2026-09-28T10:05:00.000Z',
      fileName: 'capture.png',
    })
  })

  it('sans stockage branché : 404, jamais une erreur technique', async () => {
    const { controller } = build({ storage: false })
    await expect(controller.downloadImage(user, 'img-1')).rejects.toBeInstanceOf(NotFoundException)
  })

  it('objet introuvable dans CET espace (autre espace, ou id deviné) : 404', async () => {
    const signedUrlFor = jest.fn().mockRejectedValue(new NotFoundException('introuvable'))
    const { controller } = build({ signedUrlFor })
    await expect(controller.downloadImage(user, 'img-x')).rejects.toBeInstanceOf(NotFoundException)
  })
})
