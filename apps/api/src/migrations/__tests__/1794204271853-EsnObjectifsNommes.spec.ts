import type { QueryRunner } from 'typeorm'
import { EsnObjectifsNommes1794204271853 } from '../1794204271853-EsnObjectifsNommes'

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

// #2052 — lot L19 : les objectifs commerciaux NOMMÉS.
describe('EsnObjectifsNommes1794204271853', () => {
  it('ajoute la colonne `esn_objectives`, jsonb, non nulle, par défaut un tableau vide', async () => {
    const { runner, queries } = createRunner()
    await new EsnObjectifsNommes1794204271853().up(runner)
    const sql = normalize(queries.join(' '))
    expect(sql).toContain("ADD COLUMN IF NOT EXISTS esn_objectives jsonb NOT NULL DEFAULT '[]'::jsonb")
  })

  it('est rejouable : la montée passe par IF NOT EXISTS', async () => {
    const { runner, queries } = createRunner()
    await new EsnObjectifsNommes1794204271853().up(runner)
    const statements = normalize(queries.join(' '))
      .split(';')
      .map(s => s.trim())
      .filter(Boolean)
    expect(statements.length).toBe(1)
    expect(statements[0]).toContain('IF NOT EXISTS')
  })

  it("n'ajoute QUE la colonne : aucun DROP, aucun ALTER de contrainte dans la montée", async () => {
    const { runner, queries } = createRunner()
    await new EsnObjectifsNommes1794204271853().up(runner)
    const sql = normalize(queries.join(' '))
    expect(sql).not.toContain('DROP')
    expect(sql).not.toContain('CHECK')
    // #2052.1 — `monthly_target` n'est jamais touché : on archive, on ne
    // supprime pas.
    expect(sql).not.toContain('monthly_target')
  })

  it('sait redescendre', async () => {
    const { runner, queries } = createRunner()
    await new EsnObjectifsNommes1794204271853().down(runner)
    const sql = normalize(queries.join(' '))
    expect(sql).toContain('DROP COLUMN IF EXISTS esn_objectives')
  })
})
