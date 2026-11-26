import { ServiceUnavailableException } from '@nestjs/common'
import { BaseReaderController } from './base-reader.controller'
import type { BaseReaderIdentityDto } from './dto/base-reader-identity.dto'
import type { BaseReaderScope, BaseReaderService } from './base-reader.service'

/** #4419.7 — la porte d'identité : l'espace du demandeur se résout AU BORD, sans service de périmètre elle LÈVE. */

const USER = '44444444-4444-4444-8444-444444444444'
const dto = { userId: USER, name: 'Consort Group' } as unknown as BaseReaderIdentityDto

function controllerOf(withBusinessUnits = true) {
  const identityByName = jest.fn<Promise<null>, [BaseReaderScope, string]>(async () => null)
  const reader = { identityByName } as unknown as BaseReaderService
  const workspaceContext = {
    resolveActiveWorkspace: jest.fn(async () => ({ workspaceId: 'ws-A', role: 'owner' })),
  } as never
  const businessUnits = withBusinessUnits ? ({ scopeFor: jest.fn(async () => null) } as never) : undefined
  return { controller: new BaseReaderController(reader, workspaceContext, businessUnits), identityByName }
}

describe('#4419.7 — POST base/identity', () => {
  it("lit dans l'espace ACTIF du demandeur, pas un autre", async () => {
    const { controller, identityByName } = controllerOf()
    await expect(controller.identity(dto)).resolves.toEqual({ identity: null })
    expect(identityByName).toHaveBeenCalledWith({ workspaceId: 'ws-A', businessUnitScope: null }, 'Consort Group')
  })

  it('sans service de périmètre, elle LÈVE', async () => {
    const { controller, identityByName } = controllerOf(false)
    await expect(controller.identity(dto)).rejects.toBeInstanceOf(ServiceUnavailableException)
    expect(identityByName).not.toHaveBeenCalled()
  })
})
