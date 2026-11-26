import type { QueryRunner } from 'typeorm'
import { CompanyLocations1795610000000 } from '../1795610000000-CompanyLocations'

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

// #2005.4 (DÉCISION Louis 17/09, lot CP2) — où l'ESN est implantée.
describe('CompanyLocations1795610000000', () => {
  it('ajoute la colonne `company_locations`, tableau vide par défaut, aucun CHECK', async () => {
    const { runner, queries } = createRunner()
    await new CompanyLocations1795610000000().up(runner)
    const sql = normalize(queries.join(' '))
    expect(sql).toContain("ADD COLUMN IF NOT EXISTS company_locations text[] DEFAULT '{}'")
    expect(sql).not.toMatch(/NOT NULL/)
  })

  it('est rejouable : IF NOT EXISTS', async () => {
    const { runner, queries } = createRunner()
    await new CompanyLocations1795610000000().up(runner)
    const statements = normalize(queries.join(' '))
      .split(';')
      .map(s => s.trim())
      .filter(Boolean)
    expect(statements.length).toBe(1)
    expect(statements[0]).toContain('IF NOT EXISTS')
  })

  it('sait redescendre — une seule colonne, jamais une de plus (témoin de non-fuite)', async () => {
    const { runner, queries } = createRunner()
    await new CompanyLocations1795610000000().down(runner)
    const sql = normalize(queries.join(' '))
    expect(sql).toContain('DROP COLUMN IF EXISTS company_locations')
    expect(sql).not.toContain('client_references')
  })
})
