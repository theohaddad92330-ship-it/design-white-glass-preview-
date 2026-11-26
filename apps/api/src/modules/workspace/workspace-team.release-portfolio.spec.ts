import { AccountEntity } from '../../database/entities/account.entity'
import { WorkspaceTeamService } from './workspace-team.service'
import { resolveBrand } from '@bellum/contracts'

/** Le service de marque, réduit à ce que le code testé lui demande. `null` =
 *  aucune adresse déclarée par l'espace, donc repli sur l'environnement. */
/**
 * Le service de marque, réduit à ce que le code testé lui demande : la marque
 * du PRODUIT, c'est-à-dire un espace qui n'a rien posé — et `null` pour
 * l'adresse d'expédition, donc repli sur celle d'environnement.
 */
const brandsStub = {
  getForUser: jest.fn().mockResolvedValue(resolveBrand(null)),
  getForWorkspace: jest.fn().mockResolvedValue(resolveBrand(null)),
  getSendingAddress: jest.fn().mockResolvedValue(null),
}

/**
 * Retirer un membre libère son portefeuille.
 *
 * `removeMember` supprimait la ligne d'appartenance et s'arrêtait là. Les
 * comptes et contacts gardaient donc l'identifiant d'une personne qui n'est
 * plus dans l'espace — et ces enregistrements devenaient **invisibles ET
 * verrouillés** :
 *
 *  - invisibles, parce que la file « non attribués » du cockpit filtre sur
 *    `assigned_to IS NULL` : un compte porté par un fantôme n'y apparaît pas,
 *    et il est compté comme « attribué » dans les indicateurs d'équipe ;
 *  - verrouillés, parce que le libre-service refuse de reprendre un compte
 *    déjà porté par quelqu'un d'autre — il fallait un manager pour chacun.
 *
 * La libération est le geste honnête : le portefeuille retourne dans la file
 * des non-attribués, là où l'équipe le voit et peut s'en saisir. On ne le
 * réattribue à personne d'office — désigner un successeur au hasard est
 * exactement ce que le produit refuse ailleurs (une tâche chez la mauvaise
 * personne est ignorée, puis pourrit la vue de quelqu'un qui n'y peut rien).
 *
 * La libération est BEST-EFFORT et vient APRÈS la suppression : un membre déjà
 * retiré ne doit pas se retrouver ré-inscrit parce qu'un UPDATE a échoué.
 */
describe('WorkspaceTeamService.removeMember — libération du portefeuille', () => {
  const build = (over: { accountsUpdate?: jest.Mock; contactsUpdate?: jest.Mock } = {}) => {
    const accountsUpdate = over.accountsUpdate ?? jest.fn().mockResolvedValue({ affected: 3 })
    const contactsUpdate = over.contactsUpdate ?? jest.fn().mockResolvedValue({ affected: 7 })
    // #4158.54 — le helper partagé `releaseMemberWork` écrit par l'`EntityManager` : on route
    // `manager.update(Entité, where, set)` vers le mock de la bonne table.
    const query = jest.fn().mockResolvedValue([])
    const manager = {
      update: jest.fn((entity: unknown, where: unknown, set: unknown) =>
        entity === AccountEntity ? accountsUpdate(where, set) : contactsUpdate(where, set),
      ),
      query,
    }
    const members = {
      findOne: jest.fn().mockResolvedValue({ workspace_id: 'w-1', user_id: 'u-partant', role: 'sales' }),
      delete: jest.fn().mockResolvedValue({ affected: 1 }),
    }
    const workspaceContext = {
      resolveActiveWorkspace: jest.fn().mockResolvedValue({ workspaceId: 'w-1' }),
      assertPermission: jest.fn().mockResolvedValue({ role: 'owner' }),
    }
    const service = new WorkspaceTeamService(
      workspaceContext as never,
      { get: jest.fn() } as never,
      {} as never,
      {} as never,
      members as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      brandsStub as never,
      undefined as never,
      { manager } as never,
      { manager } as never,
    )
    return { service, members, accountsUpdate, contactsUpdate, query }
  }

  it('remet les comptes du partant dans la file des non-attribués', async () => {
    const { service, accountsUpdate } = build()

    await service.removeMember('u-manager', 'u-partant')

    expect(accountsUpdate).toHaveBeenCalledWith(
      { workspace_id: 'w-1', assigned_to: 'u-partant' },
      { assigned_to: null },
    )
  })

  it('fait de même pour ses contacts', async () => {
    const { service, contactsUpdate } = build()

    await service.removeMember('u-manager', 'u-partant')

    expect(contactsUpdate).toHaveBeenCalledWith(
      { workspace_id: 'w-1', assigned_to: 'u-partant' },
      { assigned_to: null },
    )
  })

  it('libère APRÈS la suppression — un membre retiré ne se ré-inscrit pas parce qu’un UPDATE a échoué', async () => {
    const { service, members, accountsUpdate } = build()
    const order: string[] = []
    members.delete.mockImplementation(async () => {
      order.push('delete')
      return { affected: 1 }
    })
    accountsUpdate.mockImplementation(async () => {
      order.push('release')
      return { affected: 0 }
    })

    await service.removeMember('u-manager', 'u-partant')

    expect(order).toEqual(['delete', 'release'])
  })

  it('retire quand même le membre si la libération échoue', async () => {
    const { service } = build({ accountsUpdate: jest.fn().mockRejectedValue(new Error('pg down')) })

    await expect(service.removeMember('u-manager', 'u-partant')).resolves.toEqual({ removed: true })
  })

  it('ne touche à rien quand les dépôts ne sont pas câblés — comportement d’avant intact', async () => {
    const members = {
      findOne: jest.fn().mockResolvedValue({ workspace_id: 'w-1', user_id: 'u-partant', role: 'sales' }),
      delete: jest.fn().mockResolvedValue({ affected: 1 }),
    }
    const service = new WorkspaceTeamService(
      {
        resolveActiveWorkspace: jest.fn().mockResolvedValue({ workspaceId: 'w-1' }),
        assertPermission: jest.fn().mockResolvedValue({ role: 'owner' }),
      } as never,
      { get: jest.fn() } as never,
      {} as never,
      {} as never,
      members as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      brandsStub as never,
    )

    await expect(service.removeMember('u-manager', 'u-partant')).resolves.toEqual({ removed: true })
  })

  it('ne libère rien quand le membre visé est introuvable', async () => {
    const { service, members, accountsUpdate } = build()
    members.findOne.mockResolvedValue(null)

    await expect(service.removeMember('u-manager', 'u-inconnu')).rejects.toThrow()
    expect(accountsUpdate).not.toHaveBeenCalled()
  })
})

describe('#4158.54 — releasePortfolio passe par le helper partagé', () => {
  it('libère aussi les actions déléguées, bornées aux comptes de l’espace (même SQL que le back-office)', async () => {
    const accountsUpdate = jest.fn().mockResolvedValue({ affected: 0 })
    const contactsUpdate = jest.fn().mockResolvedValue({ affected: 0 })
    const query = jest.fn().mockResolvedValue([])
    const manager = {
      update: jest.fn((entity: unknown, where: unknown, set: unknown) =>
        entity === AccountEntity ? accountsUpdate(where, set) : contactsUpdate(where, set),
      ),
      query,
    }
    const members = {
      findOne: jest.fn().mockResolvedValue({ workspace_id: 'w-1', user_id: 'u-partant', role: 'sales' }),
      delete: jest.fn().mockResolvedValue({ affected: 1 }),
    }
    const service = new WorkspaceTeamService(
      {
        resolveActiveWorkspace: jest.fn().mockResolvedValue({ workspaceId: 'w-1' }),
        assertPermission: jest.fn().mockResolvedValue({ role: 'owner' }),
      } as never,
      { get: jest.fn() } as never,
      {} as never,
      {} as never,
      members as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      brandsStub as never,
      undefined as never,
      { manager } as never,
      { manager } as never,
    )
    await service.removeMember('u-manager', 'u-partant')
    expect(query).toHaveBeenCalledTimes(1)
    expect(query.mock.calls[0][0]).toMatch(/UPDATE action_plan_items/i)
    expect(query.mock.calls[0][1]).toEqual(['u-partant', 'w-1'])
  })
})
