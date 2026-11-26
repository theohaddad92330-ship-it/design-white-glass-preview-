import { GUARDS_METADATA } from '@nestjs/common/constants'
import { InternalSecretGuard } from '../../common/internal-secret.guard'
import { WorkspaceOwnershipTransferController } from './workspace-ownership-transfer.controller'

// #4158.33 — ce contrôleur déplace une propriété ET un abonnement : la garde du
// secret interne ne doit jamais disparaître.
describe('WorkspaceOwnershipTransferController', () => {
  it('est gardé par le secret interne', () => {
    const guards = Reflect.getMetadata(GUARDS_METADATA, WorkspaceOwnershipTransferController) as unknown[]
    expect(guards).toContain(InternalSecretGuard)
  })

  it('délègue la prévisualisation et le transfert au service avec le nouveau propriétaire demandé', async () => {
    const service = { preview: jest.fn().mockResolvedValue('p'), transfer: jest.fn().mockResolvedValue('t') }
    const controller = new WorkspaceOwnershipTransferController(service as never)
    await expect(controller.preview('ws', { newOwnerUserId: 'u' })).resolves.toBe('p')
    await expect(controller.transfer('ws', { newOwnerUserId: 'u' })).resolves.toBe('t')
    expect(service.preview).toHaveBeenCalledWith('ws', 'u')
    expect(service.transfer).toHaveBeenCalledWith('ws', 'u')
  })
})
