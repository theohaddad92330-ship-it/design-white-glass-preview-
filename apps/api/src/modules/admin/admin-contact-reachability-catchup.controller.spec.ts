import { AdminContactReachabilityCatchupController } from './admin-contact-reachability-catchup.controller'
import type { ContactReachabilityCatchupService } from '../contacts/contact-reachability-catchup.service'

/** #3549 — la seule porte d'entrée du rattrapage : le contrôleur délègue, rien de plus. */
describe('AdminContactReachabilityCatchupController', () => {
  let listConcerned: jest.Mock
  let runCatchup: jest.Mock
  let controller: AdminContactReachabilityCatchupController

  beforeEach(() => {
    listConcerned = jest.fn().mockResolvedValue([{ id: 'c1' }, { id: 'c2' }])
    runCatchup = jest.fn().mockResolvedValue({ scanned: 2, enqueued: 2, skipped: 0, cut: false })
    controller = new AdminContactReachabilityCatchupController({
      listConcerned,
      runCatchup,
    } as unknown as ContactReachabilityCatchupService)
  })

  it('preview chiffre les contacts concernés sans rien lancer', async () => {
    expect(await controller.preview('50')).toEqual({ concerned: 2 })
    expect(listConcerned).toHaveBeenCalledWith(50)
    expect(runCatchup).not.toHaveBeenCalled()
  })

  it('run déclenche runCatchup(actor, limit)', async () => {
    await controller.run({ actor: 'louis', limit: 25 })
    expect(runCatchup).toHaveBeenCalledWith('louis', 25)
  })

  it('sans acteur, retombe sur « backoffice »', async () => {
    await controller.run({})
    expect(runCatchup).toHaveBeenCalledWith('backoffice', undefined)
  })

  // E1 (#3698, points 6 et 7) — le rattrapage CIBLÉ et la lecture de couverture.
  it('targeted rejoue exactement la liste d’ids donnée', async () => {
    const runForIds = jest
      .fn()
      .mockResolvedValue({ requested: 1, enqueued: 1, skipped: 0, cut: false, per_contact: [] })
    const coverage = jest.fn().mockResolvedValue({ contacts: 1 })
    const targeted = new AdminContactReachabilityCatchupController({
      runForIds,
      coverage,
    } as unknown as ContactReachabilityCatchupService)
    const ids = ['11111111-1111-4111-8111-111111111111']
    await targeted.runTargeted({ actor: 'louis', contact_ids: ids })
    expect(runForIds).toHaveBeenCalledWith('louis', ids)
    await targeted.coverage({ contact_ids: ids })
    expect(coverage).toHaveBeenCalledWith(ids)
  })
})
