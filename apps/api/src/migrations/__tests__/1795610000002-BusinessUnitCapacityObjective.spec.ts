import type { QueryRunner } from 'typeorm'
import { BusinessUnitCapacityObjective1795610000002 } from '../1795610000002-BusinessUnitCapacityObjective'

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

// #2005.5 (DÉCISION Louis 17/09, lot CP2) — capacité et objectif du trimestre
// de BU, saisis par le responsable de BU.
describe('BusinessUnitCapacityObjective1795610000002', () => {
  it('ajoute `capacity_available_consultants` (integer, nullable) et `quarter_objective` (text, nullable), aucun CHECK', async () => {
    const { runner, queries } = createRunner()
    await new BusinessUnitCapacityObjective1795610000002().up(runner)
    const sql = normalize(queries.join(' '))
    expect(sql).toContain('ADD COLUMN IF NOT EXISTS capacity_available_consultants integer')
    expect(sql).toContain('ADD COLUMN IF NOT EXISTS quarter_objective text')
    expect(sql).not.toMatch(/NOT NULL/)
    expect(sql).not.toMatch(/DEFAULT 0/)
  })

  it('est rejouable : IF NOT EXISTS sur les deux colonnes', async () => {
    const { runner, queries } = createRunner()
    await new BusinessUnitCapacityObjective1795610000002().up(runner)
    const statements = normalize(queries.join(' '))
      .split(';')
      .map(s => s.trim())
      .filter(Boolean)
    expect(statements.every(s => s.includes('IF NOT EXISTS'))).toBe(true)
  })

  it('sait redescendre — les deux colonnes, jamais une de plus (témoin de non-fuite)', async () => {
    const { runner, queries } = createRunner()
    await new BusinessUnitCapacityObjective1795610000002().down(runner)
    const sql = normalize(queries.join(' '))
    expect(sql).toContain('DROP COLUMN IF EXISTS capacity_available_consultants')
    expect(sql).toContain('DROP COLUMN IF EXISTS quarter_objective')
    expect(sql).not.toContain('consultant_count')
  })
})
