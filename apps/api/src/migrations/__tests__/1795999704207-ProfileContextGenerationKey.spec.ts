import type { QueryRunner } from 'typeorm'
import { ProfileContextGenerationKey1795999704207 } from '../1795999704207-ProfileContextGenerationKey'

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

// #2009.14 — réutiliser une génération déjà terminée sur la MÊME clé.
describe('ProfileContextGenerationKey1795999704207', () => {
  it('ajoute une colonne nullable, sans CHECK', async () => {
    const { runner, queries } = createRunner()
    await new ProfileContextGenerationKey1795999704207().up(runner)
    const sql = normalize(queries.join(' '))

    expect(sql).toContain('ADD COLUMN IF NOT EXISTS profile_context_generation_key text')
    expect(sql).not.toMatch(/profile_context_generation_key text NOT NULL/)
    expect(sql).not.toContain('CHECK')
  })

  it('est rejouable : IF NOT EXISTS', async () => {
    const { runner, queries } = createRunner()
    await new ProfileContextGenerationKey1795999704207().up(runner)
    const sql = normalize(queries.join(' '))
    expect(sql).toContain('IF NOT EXISTS')
  })

  it('sait redescendre', async () => {
    const { runner, queries } = createRunner()
    await new ProfileContextGenerationKey1795999704207().down(runner)
    const sql = normalize(queries.join(' '))
    expect(sql).toContain('DROP COLUMN IF EXISTS profile_context_generation_key')
  })
})
