import type { AccountEntitiesService } from '../account-entities/account-entities.service'
import type { WorkspaceContextService } from '../workspace/workspace-context.service'
import { AccountAccessController } from './account-access.controller'
import type { AccountAccessService } from './account-access.service'

/**
 * #3473 (recette Y9) — « Par quelle entité entrer » absent en prod sur La Poste.
 *
 * Les entités d'un compte ne se matérialisent qu'à la lecture de l'onglet
 * Entités (`reconcileAccount`) : le paysage d'accès lisait la table SANS passer
 * par là, donc un compte dont personne n'avait ouvert les entités n'avait
 * aucune porte à montrer, alors que ses contacts nommaient déjà leurs divisions.
 */
describe('AccountAccessController.landscape (#3473)', () => {
  const user = { userId: 'u-1' } as never
  const landscape = { entities: [{ id: 'e-1' }] }

  function build(reconcile: jest.Mock) {
    const calls: string[] = []
    const access = {
      landscape: jest.fn().mockImplementation(async () => {
        calls.push('landscape')
        return landscape
      }),
    } as unknown as AccountAccessService
    const entities = {
      reconcileAccount: reconcile.mockImplementation(async () => {
        calls.push('reconcile')
      }),
    } as unknown as AccountEntitiesService
    const workspaceContext = {
      resolveActiveWorkspace: jest.fn().mockResolvedValue({ workspaceId: 'w-1' }),
    } as unknown as WorkspaceContextService
    return { controller: new AccountAccessController(access, workspaceContext, entities), calls, access }
  }

  it('rattache les divisions nommées par les contacts AVANT de lire le paysage', async () => {
    const reconcile = jest.fn()
    const { controller, calls } = build(reconcile)
    await expect(controller.landscape(user, 'a-1')).resolves.toBe(landscape)
    expect(reconcile).toHaveBeenCalledWith('w-1', 'a-1')
    expect(calls).toEqual(['reconcile', 'landscape'])
  })

  it('une réconciliation en échec ne casse JAMAIS la lecture de l’onglet', async () => {
    const reconcile = jest.fn()
    const { controller, access } = build(reconcile)
    reconcile.mockRejectedValue(new Error('db down'))
    await expect(controller.landscape(user, 'a-1')).resolves.toBe(landscape)
    expect(access.landscape).toHaveBeenCalledWith('w-1', 'a-1')
  })
})
