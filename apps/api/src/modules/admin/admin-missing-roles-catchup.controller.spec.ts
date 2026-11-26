import { AdminMissingRolesCatchupController } from './admin-missing-roles-catchup.controller'
import type { MissingRolesCatchupService } from '../analysis/missing-roles-catchup.service'

/**
 * #2637.1 (21/09/2026) — LA SEULE PORTE D'ENTRÉE du rattrapage automatique des
 * rôles manquants. Ce contrôleur ne fait que déléguer — la garde utile est
 * « l'acteur et la limite passent tels quels », jamais recalculés ici.
 */
describe('AdminMissingRolesCatchupController', () => {
  let listConcernedAccounts: jest.Mock
  let runCatchup: jest.Mock
  let controller: AdminMissingRolesCatchupController

  beforeEach(() => {
    listConcernedAccounts = jest.fn().mockResolvedValue([{ id: 'acc-1' }])
    runCatchup = jest.fn().mockResolvedValue({ scanned: 1, launched: 1, skipped: 0, failed: 0, cut: false })
    const catchup = { listConcernedAccounts, runCatchup } as unknown as MissingRolesCatchupService
    controller = new AdminMissingRolesCatchupController(catchup)
  })

  it('preview lit les comptes concernés avec la limite fournie', async () => {
    const result = await controller.preview('50')
    expect(listConcernedAccounts).toHaveBeenCalledWith(50)
    expect(result).toEqual({ concerned: 1 })
  })

  it('preview sans limite ne borne pas explicitement — le service applique son défaut', async () => {
    await controller.preview(undefined)
    expect(listConcernedAccounts).toHaveBeenCalledWith(undefined)
  })

  it('run déclenche runCatchup(actor, limit)', async () => {
    const outcome = await controller.run({ actor: 'louis', limit: 25 })
    expect(runCatchup).toHaveBeenCalledWith('louis', 25)
    expect(outcome).toEqual({ scanned: 1, launched: 1, skipped: 0, failed: 0, cut: false })
  })

  it('sans acteur explicite, retombe sur "backoffice" — même convention que segment-catchup', async () => {
    await controller.run({})
    expect(runCatchup).toHaveBeenCalledWith('backoffice', undefined)
  })
})
