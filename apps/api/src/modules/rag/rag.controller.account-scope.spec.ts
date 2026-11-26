import { NotFoundException } from '@nestjs/common'
import { success } from '@bellum/utils'
import type { CurrentUserPayload } from '../../common/decorator/current-user.decorator'
import type { IaClient } from '../ia/ia.client'
import type { RagIngestDto } from '../ia-proxy/dto/ia-proxy.dto'
import type { WorkspaceContextService } from '../workspace/workspace-context.service'
import { RagController } from './rag.controller'
import type { RagService } from './rag.service'
import type { RagZipIngestJobService } from './rag-zip-ingest-job.service'
import type { ImportService } from '../import/import.service'
import type { ImportWriterService } from '../import/import-writer.service'

/**
 * #2779 — « Un compte précis » : le compte vient du CORPS, donc il est vérifié
 * contre l'espace résolu côté serveur AVANT tout dépôt. Un identifiant de
 * compte d'un autre espace ne rattache jamais un document (404, rien n'est
 * envoyé au service IA).
 */
describe('RagController — portée « compte précis » (#2779)', () => {
  const user = { userId: 'u-1' } as CurrentUserPayload
  const ACCOUNT = '0000000a-0000-4000-8000-00000000000a'

  function build(accountInWorkspace: boolean) {
    const ia = { ragIngest: jest.fn().mockResolvedValue({ success: true, data: {} }) }
    const rag = {
      accountInWorkspace: jest.fn().mockResolvedValue(accountInWorkspace),
      updateScopeForUser: jest.fn().mockResolvedValue(success()),
    }
    const zipIngest = { enqueue: jest.fn().mockResolvedValue({ jobId: 'j', status: 'pending' }) }
    const workspaceContext = {
      resolveActiveWorkspace: jest.fn().mockResolvedValue({ workspaceId: 'ws-1' }),
      isDemoWorkspace: jest.fn().mockResolvedValue(false),
    }
    const controller = new RagController(
      rag as unknown as RagService,
      ia as unknown as IaClient,
      workspaceContext as unknown as WorkspaceContextService,
      zipIngest as unknown as RagZipIngestJobService,
      {} as ImportService,
      {} as ImportWriterService,
    )
    return { controller, ia, rag, zipIngest }
  }

  const dto = { title: 'Note', content: 'texte', scope: 'account', accountId: ACCOUNT } as RagIngestDto

  it('dépose un document rattaché à un compte DE l’espace, en transmettant le compte', async () => {
    const { controller, ia, rag } = build(true)
    await controller.ingest(user, dto)
    expect(rag.accountInWorkspace).toHaveBeenCalledWith(ACCOUNT, 'ws-1')
    expect(ia.ragIngest).toHaveBeenCalledWith(expect.objectContaining({ scope: 'account', accountId: ACCOUNT }))
  })

  it('NON : un compte d’un autre espace → 404, rien n’est déposé', async () => {
    const { controller, ia } = build(false)
    await expect(controller.ingest(user, dto)).rejects.toBeInstanceOf(NotFoundException)
    expect(ia.ragIngest).not.toHaveBeenCalled()
  })

  it('NON : même refus pour une archive', async () => {
    const { controller, zipIngest } = build(false)
    await expect(
      controller.ingestZip(user, { fileB64: 'x', filename: 'a.zip', scope: 'account', accountId: ACCOUNT }),
    ).rejects.toBeInstanceOf(NotFoundException)
    expect(zipIngest.enqueue).not.toHaveBeenCalled()
  })

  it('une archive rattachée à un compte de l’espace transmet le compte', async () => {
    const { controller, zipIngest } = build(true)
    await controller.ingestZip(user, { fileB64: 'x', filename: 'a.zip', scope: 'account', accountId: ACCOUNT })
    expect(zipIngest.enqueue).toHaveBeenCalledWith(
      'u-1',
      'ws-1',
      'x',
      expect.objectContaining({ scope: 'account', accountId: ACCOUNT }),
    )
  })

  it('les autres portées ne consultent pas les comptes', async () => {
    const { controller, rag, ia } = build(false)
    await controller.ingest(user, { title: 'Note', content: 'texte', scope: 'personal' } as RagIngestDto)
    expect(rag.accountInWorkspace).not.toHaveBeenCalled()
    expect(ia.ragIngest).toHaveBeenCalledWith(expect.objectContaining({ scope: 'personal' }))
  })

  it('changer la portée transmet le compte demandé au service', async () => {
    const { controller, rag } = build(true)
    await controller.updateScope('doc-1', { scope: 'account', accountId: ACCOUNT }, user)
    expect(rag.updateScopeForUser).toHaveBeenCalledWith('doc-1', 'u-1', 'ws-1', 'account', null, ACCOUNT)
  })

  it('la liste passe l’auteur, pour ses documents personnels', async () => {
    const listForWorkspace = jest.fn().mockResolvedValue([])
    const controller = new RagController(
      { listForWorkspace } as unknown as RagService,
      {} as IaClient,
      {
        resolveActiveWorkspace: jest.fn().mockResolvedValue({ workspaceId: 'ws-1' }),
      } as unknown as WorkspaceContextService,
      {} as RagZipIngestJobService,
      {} as ImportService,
      {} as ImportWriterService,
    )
    await controller.list(user)
    expect(listForWorkspace).toHaveBeenCalledWith('ws-1', 'u-1')
  })
})
