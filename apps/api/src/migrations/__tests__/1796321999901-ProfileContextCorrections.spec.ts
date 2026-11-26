import type { QueryRunner } from 'typeorm'
import { ProfileContextCorrections1796321999901 } from '../1796321999901-ProfileContextCorrections'

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

// #2908 (#2010.4) — `profile_context_corrections` : une colonne SÉPARÉE de
// `profile_context`, jamais réécrite par une régénération. Additive, nullable :
// `NULL`/`{}` tant qu'aucune correction n'a été posée (comportement d'avant,
// inchangé).
describe('ProfileContextCorrections1796321999901', () => {
  it('adds profile_context_corrections (jsonb, nullable) on profiles', async () => {
    const { runner, queries } = createRunner()
    await new ProfileContextCorrections1796321999901().up(runner)
    const add = queries.map(normalize).find(q => q.includes('ADD COLUMN IF NOT EXISTS profile_context_corrections'))
    expect(add).toBeDefined()
    expect(add).toContain('ALTER TABLE profiles ADD COLUMN IF NOT EXISTS profile_context_corrections jsonb')
  })

  it('down() is not supported (repo convention — additive, forward-only)', async () => {
    await expect(new ProfileContextCorrections1796321999901().down()).rejects.toThrow(
      'down migrations are not supported',
    )
  })
})
