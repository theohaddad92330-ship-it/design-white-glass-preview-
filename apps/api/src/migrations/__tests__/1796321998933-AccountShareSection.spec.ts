import type { QueryRunner } from 'typeorm'
import { AccountShareSection1796321998933 } from '../1796321998933-AccountShareSection'

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

// #2914 (#2128.11) — un lien de partage porte le dossier ENTIER ou une
// section. Additive, jamais NULL : `'full'` dit pour tout lien déjà émis ce
// qu'il faisait déjà, sans backfill à écrire.
describe('AccountShareSection1796321998933', () => {
  it("adds section (text, NOT NULL, default 'full')", async () => {
    const { runner, queries } = createRunner()
    await new AccountShareSection1796321998933().up(runner)
    const flat = queries.map(normalize)
    const add = flat.find(q => q.includes('ADD COLUMN IF NOT EXISTS section'))
    expect(add).toBeDefined()
    expect(add).toContain("text NOT NULL DEFAULT 'full'")
  })

  it('down() is not supported (repo convention — additive, forward-only)', async () => {
    await expect(new AccountShareSection1796321998933().down()).rejects.toThrow('down migrations are not supported')
  })
})
