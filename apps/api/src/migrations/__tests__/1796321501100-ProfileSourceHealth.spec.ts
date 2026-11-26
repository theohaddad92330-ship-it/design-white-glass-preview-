import type { QueryRunner } from 'typeorm'
import { ProfileSourceHealth1796321501100 } from '../1796321501100-ProfileSourceHealth'

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

// #2012.12 (épopée #2776) — `source_health` : la couverture réduite du
// Profileur par source facultative, additive et nullable (comportement
// d'avant inchangé tant qu'aucune génération n'a posé de signal).
describe('ProfileSourceHealth1796321501100', () => {
  it('adds source_health (jsonb, nullable) on profiles', async () => {
    const { runner, queries } = createRunner()
    await new ProfileSourceHealth1796321501100().up(runner)
    const add = queries.map(normalize).find(q => q.includes('ADD COLUMN IF NOT EXISTS source_health'))
    expect(add).toBeDefined()
    expect(add).toContain('ALTER TABLE profiles ADD COLUMN IF NOT EXISTS source_health jsonb')
  })

  it('down() is not supported (repo convention — additive, forward-only)', async () => {
    await expect(new ProfileSourceHealth1796321501100().down()).rejects.toThrow('down migrations are not supported')
  })
})
