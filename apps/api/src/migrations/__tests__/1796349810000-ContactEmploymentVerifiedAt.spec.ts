import type { QueryRunner } from 'typeorm'
import { ContactEmploymentVerifiedAt1796349810000 } from '../1796349810000-ContactEmploymentVerifiedAt'

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

/** #2159.62 — la dernière vérification d'emploi d'un contact. */
describe('ContactEmploymentVerifiedAt1796349810000', () => {
  it('ajoute `employment_verified_at`, timestamptz, sans valeur par défaut (non mesuré, jamais deviné)', async () => {
    const { runner, queries } = createRunner()
    await new ContactEmploymentVerifiedAt1796349810000().up(runner)
    expect(normalize(queries.join(' '))).toContain('ADD COLUMN IF NOT EXISTS employment_verified_at timestamptz NULL')
  })

  it('est rejouable : la montée passe par IF NOT EXISTS', async () => {
    const { runner, queries } = createRunner()
    await new ContactEmploymentVerifiedAt1796349810000().up(runner)
    const statements = normalize(queries.join(' '))
      .split(';')
      .map(statement => statement.trim())
      .filter(Boolean)
    expect(statements).toHaveLength(1)
    expect(statements[0]).toContain('IF NOT EXISTS')
  })

  it('AJOUT SEULEMENT : la descente retire uniquement la colonne ajoutée', async () => {
    const { runner, queries } = createRunner()
    await new ContactEmploymentVerifiedAt1796349810000().down(runner)
    expect(normalize(queries.join(' '))).toBe('ALTER TABLE contacts DROP COLUMN IF EXISTS employment_verified_at')
  })
})
