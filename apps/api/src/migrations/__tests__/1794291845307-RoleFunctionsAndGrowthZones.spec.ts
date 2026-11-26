import type { QueryRunner } from 'typeorm'
import { RoleFunctionsAndGrowthZones1794291845307 } from '../1794291845307-RoleFunctionsAndGrowthZones'

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

describe('RoleFunctionsAndGrowthZones1794291845307', () => {
  it('ajoute les deux colonnes, NOT NULL DEFAULT tableau vide (#2032.10 / #2036.9)', async () => {
    const { runner, queries } = createRunner()
    await new RoleFunctionsAndGrowthZones1794291845307().up(runner)
    const sql = normalize(queries.join(' '))
    for (const column of ['role_functions_practiced', 'growth_target_zones']) {
      expect(sql).toContain(`ADD COLUMN IF NOT EXISTS ${column} text[] NOT NULL DEFAULT '{}'`)
    }
  })

  it('est rejouable : tout passe par IF NOT EXISTS', async () => {
    const { runner, queries } = createRunner()
    await new RoleFunctionsAndGrowthZones1794291845307().up(runner)
    const statements = normalize(queries.join(' '))
      .split(';')
      .map(s => s.trim())
      .filter(Boolean)
    expect(statements.length).toBe(2)
    for (const statement of statements) {
      expect(statement).toContain('IF NOT EXISTS')
    }
  })

  it('sait redescendre', async () => {
    const { runner, queries } = createRunner()
    await new RoleFunctionsAndGrowthZones1794291845307().down(runner)
    const sql = normalize(queries.join(' '))
    expect(sql).toContain('DROP COLUMN IF EXISTS role_functions_practiced')
    expect(sql).toContain('DROP COLUMN IF EXISTS growth_target_zones')
  })
})
