import { DEMO_DELIVERY_CLIENT } from './demo-dataset'
import { DemoSeedService } from './demo-seed.service'

/**
 * #4291.3 (recette démo 21/10) — l'affaire de renouvellement SNCF (216 000 €) s'ouvrait avec un porteur « Non attribué »
 * et aucun interlocuteur : `seedManualRenewalProject` n'écrivait ni `owner_id` ni `project_contacts`.
 */
type Query = { sql: string; params: unknown[] }

async function runSeed(): Promise<Query[]> {
  const calls: Query[] = []
  const query = jest.fn(async (sql: string, params: unknown[] = []) => {
    calls.push({ sql, params })
    return /INSERT INTO opportunities/.test(sql) ? [{ id: 'opp-1' }] : []
  })
  const service = Object.create(DemoSeedService.prototype) as unknown as {
    accounts: { manager: { query: typeof query } }
    seedManualRenewalProject(w: string, a: string, m: Map<string, string>, owner: string): Promise<void>
  }
  service.accounts = { manager: { query } }
  const missionIds = new Map([[DEMO_DELIVERY_CLIENT.manualRenewalProject.missionLabel, 'mission-1']])
  await service.seedManualRenewalProject('ws-1', 'acc-1', missionIds, 'owner-1')
  return calls
}

describe('#4291.3 — affaire de renouvellement démo : un porteur nommé et un interlocuteur', () => {
  it('pose le porteur (owner_id = l’utilisateur de la salle) à l’insertion de l’affaire', async () => {
    const insert = (await runSeed()).find(call => /INSERT INTO opportunities/.test(call.sql))
    expect(insert?.sql).toMatch(/owner_id/)
    expect(insert?.params).toContain('owner-1')
  })

  it('rattache chaque interlocuteur nommé du jeu de données à l’affaire, par nom, dans le compte', async () => {
    const links = (await runSeed()).filter(call => /INSERT INTO project_contacts/.test(call.sql))
    expect(DEMO_DELIVERY_CLIENT.manualRenewalProject.contacts.length).toBeGreaterThanOrEqual(1)
    expect(links).toHaveLength(DEMO_DELIVERY_CLIENT.manualRenewalProject.contacts.length)
    for (const [index, link] of DEMO_DELIVERY_CLIENT.manualRenewalProject.contacts.entries()) {
      expect(links[index]?.params).toEqual(
        expect.arrayContaining(['ws-1', 'opp-1', 'acc-1', link.full_name, link.role]),
      )
    }
  })

  it('les interlocuteurs rattachés existent dans le dossier du compte porteur (jamais un contact fabriqué)', () => {
    const names = new Set(DEMO_DELIVERY_CLIENT.contacts.map(contact => contact.full_name))
    for (const link of DEMO_DELIVERY_CLIENT.manualRenewalProject.contacts) {
      expect(names.has(link.full_name)).toBe(true)
    }
  })

  it('sait dire NON : sans mission résolue, rien n’est écrit (ni affaire, ni lien)', async () => {
    const query = jest.fn(async () => [])
    const service = Object.create(DemoSeedService.prototype) as unknown as {
      accounts: { manager: { query: typeof query } }
      seedManualRenewalProject(w: string, a: string, m: Map<string, string>, owner: string): Promise<void>
    }
    service.accounts = { manager: { query } }
    await service.seedManualRenewalProject('ws-1', 'acc-1', new Map(), 'owner-1')
    expect(query).not.toHaveBeenCalled()
  })
})
