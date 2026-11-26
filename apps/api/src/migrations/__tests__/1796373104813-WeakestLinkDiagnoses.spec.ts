import type { QueryRunner } from 'typeorm'
import { WeakestLinkDiagnoses1796373104813 } from '../1796373104813-WeakestLinkDiagnoses'

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

describe('WeakestLinkDiagnoses1796373104813', () => {
  it('crée la table avec le maillon principal NULLABLE — « pas de maillon désignable » est un diagnostic valide', async () => {
    const { runner, queries } = createRunner()
    await new WeakestLinkDiagnoses1796373104813().up(runner)
    const sql = normalize(queries.join(' '))
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS weakest_link_diagnoses')
    expect(sql).toContain('primary_bottleneck jsonb,')
    expect(sql).toContain("secondary_bottlenecks jsonb NOT NULL DEFAULT '[]'::jsonb")
    expect(sql).toContain("not_evaluable_families jsonb NOT NULL DEFAULT '[]'::jsonb")
  })

  it('down retire la table et son index', async () => {
    const { runner, queries } = createRunner()
    await new WeakestLinkDiagnoses1796373104813().down(runner)
    const sql = normalize(queries.join(' '))
    expect(sql).toContain('DROP TABLE IF EXISTS weakest_link_diagnoses')
    expect(sql).toContain('DROP INDEX IF EXISTS weakest_link_diagnoses_workspace_computed_idx')
  })
})
