import type { QueryRunner } from 'typeorm'
import { EsnProfileUncoveredActivityNote1795712398814 } from '../1795712398814-EsnProfileUncoveredActivityNote'

/** Capture every SQL statement the migration issues (no live DB needed). */
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

describe('EsnProfileUncoveredActivityNote1795712398814', () => {
  it('ajoute la colonne, nullable, sans défaut (#2060 — GA-11/GA-12)', async () => {
    const { runner, queries } = createRunner()
    await new EsnProfileUncoveredActivityNote1795712398814().up(runner)
    const sql = normalize(queries.join(' '))
    expect(sql).toContain('ADD COLUMN IF NOT EXISTS uncovered_activity_note text')
    expect(sql).not.toContain('NOT NULL')
    expect(sql).not.toContain('DEFAULT')
  })

  it('est rejouable : passe par IF NOT EXISTS', async () => {
    const { runner, queries } = createRunner()
    await new EsnProfileUncoveredActivityNote1795712398814().up(runner)
    expect(queries).toHaveLength(1)
    expect(queries[0]).toContain('IF NOT EXISTS')
  })

  it('ne redescend pas — irréversible par convention', async () => {
    await expect(new EsnProfileUncoveredActivityNote1795712398814().down()).rejects.toThrow(
      'down migrations are not supported',
    )
  })
})
