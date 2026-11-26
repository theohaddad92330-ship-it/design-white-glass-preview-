import { LIVE_STAGES } from '@bellum/contracts'
import { ManagerService } from './manager.service'

/**
 * Les opportunités OUVERTES par propriétaire (cockpit manager, bloc 4) et les
 * stades qu'elles comptent (D52, 26/08).
 *
 * Ce bloc mesure « ce qu'il reste à travailler ». Sa liste de stades était
 * écrite à la main — l'une des cinq copies de la même notion — et un compteur
 * qui inclurait `dormant` afficherait au manager une charge que personne n'a.
 */
describe('ManagerService — les stades des opportunités ouvertes', () => {
  async function openSql(): Promise<string> {
    const query = jest.fn().mockResolvedValue([])
    const service = new ManagerService({ query } as never, {} as never)
    await service['openOpportunitiesByOwner']('ws-1', null)
    const calls = query.mock.calls as [string, unknown[]][]
    // La garde LIT : une requête, et c'est bien celle qui lit les projets.
    expect(calls).toHaveLength(1)
    const sql = calls[0]?.[0] as string
    expect(sql).toContain('FROM opportunities')
    return sql
  }

  it('compte les stades ENCORE EN JEU du contrat, pas une liste recopiée', async () => {
    const sql = await openSql()
    expect(LIVE_STAGES.length).toBeGreaterThan(0)
    for (const stage of LIVE_STAGES) expect(sql).toContain(`'${stage}'`)
  })

  it('laisse `dormant` DEHORS — il n’y a rien à y travailler', async () => {
    const sql = await openSql()
    expect(sql).not.toContain("'dormant'")
    expect(sql).not.toContain("'won'")
    expect(sql).not.toContain("'lost'")
  })
})
