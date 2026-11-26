import type { QueryRunner } from 'typeorm'
import { ConnectorCapabilityIncidents1796344355019 } from '../1796344355019-ConnectorCapabilityIncidents'

function createRunner(): { runner: QueryRunner; queries: string[] } {
  const queries: string[] = []
  const runner = {
    query: jest.fn(async (sql: string) => {
      queries.push(sql)
      return []
    }),
  } as unknown as QueryRunner
  return { runner, queries }
}

const normalize = (sql: string): string => sql.replace(/\s+/g, ' ').trim()

// #2445.12 (épopée #2766) — le journal des TRANSITIONS de connecteur, absent
// jusqu'ici : `connector_capability_probes` n'écrit que la dernière preuve.
describe('ConnectorCapabilityIncidents1796344355019', () => {
  it('crée la table avec le check `transition IN (degraded, recovered)`', async () => {
    const { runner, queries } = createRunner()
    await new ConnectorCapabilityIncidents1796344355019().up(runner)
    const flat = queries.map(normalize)

    const create = flat.find(q => q.includes('CREATE TABLE IF NOT EXISTS connector_capability_incidents'))
    expect(create).toBeDefined()
    expect(create).toContain("CHECK (transition IN ('degraded', 'recovered'))")
  })

  it('active RLS sur la table neuve', async () => {
    const { runner, queries } = createRunner()
    await new ConnectorCapabilityIncidents1796344355019().up(runner)
    expect(queries.map(normalize)).toContain('ALTER TABLE connector_capability_incidents ENABLE ROW LEVEL SECURITY')
  })

  it('down() supprime la table — neuve, additive, sans donnée existante', async () => {
    const { runner, queries } = createRunner()
    await new ConnectorCapabilityIncidents1796344355019().down(runner)
    expect(queries.map(normalize)).toContain('DROP TABLE IF EXISTS connector_capability_incidents')
  })
})
