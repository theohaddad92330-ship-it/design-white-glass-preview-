import type { QueryRunner } from 'typeorm'
import { DemoPool1788250000000 } from '../1788250000000-DemoPool'

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

describe('DemoPool1788250000000', () => {
  it('ajoute les trois colonnes du bail sans toucher aux workspaces réels', async () => {
    const { runner, queries } = createRunner()
    await new DemoPool1788250000000().up(runner)
    const sql = queries.map(normalize)

    for (const column of ['demo_slot_index integer', 'demo_leased_at timestamptz', 'demo_lease_device text']) {
      expect(sql.some(q => q.includes(`ADD COLUMN IF NOT EXISTS ${column}`))).toBe(true)
    }
    // Aucune valeur par défaut : un workspace réel reste NULL sur les trois.
    expect(sql.some(q => q.includes('DEFAULT'))).toBe(false)
  })

  it('empêche deux salles de porter le même numéro (index unique PARTIEL)', async () => {
    const { runner, queries } = createRunner()
    await new DemoPool1788250000000().up(runner)
    const index = queries.map(normalize).find(q => q.includes('CREATE UNIQUE INDEX'))

    expect(index).toContain('workspaces (demo_slot_index)')
    // Partiel : sinon tous les workspaces NON démo entreraient en conflit sur NULL.
    expect(index).toContain('WHERE demo_slot_index IS NOT NULL')
  })

  it('est rejouable', async () => {
    const { runner, queries } = createRunner()
    await new DemoPool1788250000000().up(runner)

    for (const q of queries) expect(normalize(q)).toContain('IF NOT EXISTS')
  })
})
