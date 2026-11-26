import type { QueryRunner } from 'typeorm'
import { ReferenceAccounts1796342444031 } from '../1796342444031-ReferenceAccounts'

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

// #2961 (#2302.28) — les comptes de référence NOMMÉS, structurés.
describe('ReferenceAccounts1796342444031', () => {
  it('ajoute `reference_accounts`, text[], par défaut un tableau vide', async () => {
    const { runner, queries } = createRunner()
    await new ReferenceAccounts1796342444031().up(runner)
    expect(normalize(queries.join(' '))).toContain("ADD COLUMN IF NOT EXISTS reference_accounts text[] DEFAULT '{}'")
  })

  it('est rejouable : la montée passe par IF NOT EXISTS', async () => {
    const { runner, queries } = createRunner()
    await new ReferenceAccounts1796342444031().up(runner)
    const statements = normalize(queries.join(' '))
      .split(';')
      .map(statement => statement.trim())
      .filter(Boolean)
    expect(statements).toHaveLength(1)
    expect(statements[0]).toContain('IF NOT EXISTS')
  })

  it('AJOUT SEULEMENT : la descente retire uniquement la colonne ajoutée', async () => {
    const { runner, queries } = createRunner()
    await new ReferenceAccounts1796342444031().down(runner)
    expect(normalize(queries.join(' '))).toBe('ALTER TABLE esn_profiles DROP COLUMN IF EXISTS reference_accounts;')
  })
})
