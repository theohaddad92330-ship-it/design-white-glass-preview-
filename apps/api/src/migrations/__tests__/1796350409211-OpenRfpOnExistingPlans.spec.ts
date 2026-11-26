import type { QueryRunner } from 'typeorm'
import { OpenRfpOnExistingPlans1796350409211 } from '../1796350409211-OpenRfpOnExistingPlans'

function createRunner(): { runner: QueryRunner; calls: { sql: string; params?: unknown[] }[] } {
  const calls: { sql: string; params?: unknown[] }[] = []
  const runner = {
    query: jest.fn(async (sql: string, params?: unknown[]) => {
      calls.push({ sql, params })
      return []
    }),
  } as unknown as QueryRunner
  return { runner, calls }
}

const normalize = (sql: string): string => sql.replace(/\s+/g, ' ').trim()

// #2957 (#2179.1) — la porte `rfp` ne ferme /rfp à aucun espace existant.
describe('OpenRfpOnExistingPlans1796350409211', () => {
  it('ajoute « rfp » à toutes les grilles qui ne l’ont pas, sans rien retirer', async () => {
    const { runner, calls } = createRunner()
    await new OpenRfpOnExistingPlans1796350409211().up(runner)
    expect(calls).toHaveLength(1)
    const sql = normalize(calls[0].sql)
    expect(sql).toContain('UPDATE plan_definitions')
    expect(sql).toContain("SET features = COALESCE(features, '[]'::jsonb) || to_jsonb($1::text)")
    expect(sql).toContain("WHERE NOT COALESCE(features, '[]'::jsonb) @> to_jsonb($1::text)")
    expect(sql).not.toContain('DELETE')
    expect(calls[0].params).toEqual(['rfp'])
  })

  it('down() is not supported (repo convention — additive, forward-only)', async () => {
    await expect(new OpenRfpOnExistingPlans1796350409211().down()).rejects.toThrow('down migrations are not supported')
  })
})
