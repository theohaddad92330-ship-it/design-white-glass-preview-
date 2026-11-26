import { REQUIRE_PERMISSION_KEY } from '../workspace/require-permission.decorator'
import { AccountCrmFusionController } from './account-crm-fusion.controller'
import { CrmFusionSweepDto } from './dto/crm-fusion-sweep.dto'

describe('#4603 — AccountCrmFusionController', () => {
  const fusion = { sweep: jest.fn(async () => ({ dryRun: true })), undo: jest.fn(async () => ({ restored: true })) }
  const workspaceContext = { resolveActiveWorkspace: jest.fn(async () => ({ workspaceId: 'ws-1' })) }
  const controller = new AccountCrmFusionController(fusion as never, workspaceContext as never)
  const user = { userId: 'u-1' } as never

  it('la SIMULATION est le défaut : un corps vide ne fusionne rien', async () => {
    const body = CrmFusionSweepDto.create({})
    await controller.sweep(body, user)
    expect(fusion.sweep).toHaveBeenCalledWith('ws-1', 'u-1', { dryRun: true, limit: 25 })
  })

  it('jamais tout le parc : la borne d’un passage est plafonnée', () => {
    expect(() => CrmFusionSweepDto.create({ dryRun: false, limit: 5000 })).toThrow()
  })

  it('annuler passe par l’espace de l’appelant', async () => {
    await controller.undo('f-1', user)
    expect(fusion.undo).toHaveBeenCalledWith('ws-1', 'u-1', 'f-1')
  })

  it('écrire une fusion demande le droit de gérer les intégrations', () => {
    const permission = (name: 'sweep' | 'undo') =>
      Reflect.getMetadata(REQUIRE_PERMISSION_KEY, AccountCrmFusionController.prototype[name]) as unknown
    expect(permission('sweep')).toEqual(expect.arrayContaining(['integrations:manage']))
    expect(permission('undo')).toEqual(expect.arrayContaining(['integrations:manage']))
  })
})
