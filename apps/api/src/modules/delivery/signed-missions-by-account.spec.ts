import { AccountMissionsService } from './account-missions.service'

/**
 * #1576 — sur quels comptes une mission a été SIGNÉE, et combien au total.
 *
 * Une seule requête groupée : la question se pose pour tout le portefeuille au
 * moment où l'écran des comptes s'ouvre, et une lecture par compte y serait un
 * N+1 sur un chemin chaud.
 */

type Raw = { account_id: string | null; missions: string }

function makeService(rows: Raw[] | Error) {
  const builder = {
    select: jest.fn(() => builder),
    addSelect: jest.fn(() => builder),
    where: jest.fn(() => builder),
    groupBy: jest.fn(() => builder),
    getRawMany: jest.fn(() => (rows instanceof Error ? Promise.reject(rows) : Promise.resolve(rows))),
  }
  const missions = { createQueryBuilder: jest.fn(() => builder) }
  const service = new AccountMissionsService(missions as never, {} as never, {} as never, {} as never)
  return { service, missions, builder }
}

describe('signedMissionsByAccount', () => {
  it('nomme les comptes portant au moins une mission, et compte le total', async () => {
    const { service } = makeService([
      { account_id: 'acc-a', missions: '3' },
      { account_id: 'acc-b', missions: '1' },
    ])

    const read = await service.signedMissionsByAccount('ws-1')

    expect([...read.accountIds]).toEqual(['acc-a', 'acc-b'])
    expect(read.missionsTotal).toBe(4)
  })

  it('lit UNE seule fois, groupée, et cloisonne sur l’espace', async () => {
    const { service, missions, builder } = makeService([{ account_id: 'acc-a', missions: '1' }])

    await service.signedMissionsByAccount('ws-1')

    expect(missions.createQueryBuilder).toHaveBeenCalledTimes(1)
    expect(builder.where).toHaveBeenCalledWith('mission.workspace_id = :workspaceId', { workspaceId: 'ws-1' })
  })

  it('compte une mission SANS compte rattaché dans le total, mais ne nomme personne', async () => {
    const { service } = makeService([
      { account_id: null, missions: '2' },
      { account_id: 'acc-a', missions: '1' },
    ])

    const read = await service.signedMissionsByAccount('ws-1')

    expect([...read.accountIds]).toEqual(['acc-a'])
    expect(read.missionsTotal).toBe(3)
  })

  it('rend un espace VIDE quand aucune mission n’existe — c’est une mesure, pas un aveu', async () => {
    const { service } = makeService([])

    const read = await service.signedMissionsByAccount('ws-1')

    expect(read.accountIds.size).toBe(0)
    expect(read.missionsTotal).toBe(0)
  })

  it('ne lit rien sans identifiant d’espace — jamais la table entière', async () => {
    const { service, missions } = makeService([{ account_id: 'acc-a', missions: '1' }])

    const read = await service.signedMissionsByAccount('')

    expect(missions.createQueryBuilder).not.toHaveBeenCalled()
    expect(read.missionsTotal).toBe(0)
  })

  it('laisse remonter une panne — l’appelant décide, il ne reçoit pas un zéro', async () => {
    const { service } = makeService(new Error('base HS'))

    await expect(service.signedMissionsByAccount('ws-1')).rejects.toThrow('base HS')
  })
})
