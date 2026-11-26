import type { QueryRunner } from 'typeorm'
import { ProfileQuestionnaireContactWindowsDetailLevel1789893296516 } from '../1789893296516-ProfileQuestionnaireContactWindowsDetailLevel'

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

describe('ProfileQuestionnaireContactWindowsDetailLevel1789893296516', () => {
  it('ajoute `contact_windows` en tableau NOT NULL par défaut vide, jamais NULL', async () => {
    const { runner, queries } = createRunner()
    await new ProfileQuestionnaireContactWindowsDetailLevel1789893296516().up(runner)
    const sql = normalize(queries.join(' '))
    expect(sql).toContain("ADD COLUMN IF NOT EXISTS contact_windows text[] NOT NULL DEFAULT '{}'")
  })

  it('ajoute `detail_level` en texte nullable — le questionnaire ne bloque jamais', async () => {
    const { runner, queries } = createRunner()
    await new ProfileQuestionnaireContactWindowsDetailLevel1789893296516().up(runner)
    const sql = normalize(queries.join(' '))
    expect(sql).toContain('ADD COLUMN IF NOT EXISTS detail_level text')
    expect(sql).not.toMatch(/ADD COLUMN IF NOT EXISTS detail_level text NOT NULL/)
  })

  it('est rejouable : les deux statements passent par IF NOT EXISTS', async () => {
    const { runner, queries } = createRunner()
    await new ProfileQuestionnaireContactWindowsDetailLevel1789893296516().up(runner)
    const statements = normalize(queries.join(' '))
      .split(';')
      .map(s => s.trim())
      .filter(Boolean)
    expect(statements.length).toBe(2)
    for (const statement of statements) {
      expect(statement).toContain('IF NOT EXISTS')
    }
  })

  it('down() retire les deux colonnes, jamais autre chose', async () => {
    const { runner, queries } = createRunner()
    await new ProfileQuestionnaireContactWindowsDetailLevel1789893296516().down(runner)
    const sql = normalize(queries.join(' '))
    expect(sql).toContain('DROP COLUMN IF EXISTS contact_windows')
    expect(sql).toContain('DROP COLUMN IF EXISTS detail_level')
  })

  it('sait dire NON : une colonne absente du SQL rend l’assertion fausse', async () => {
    const { runner, queries } = createRunner()
    await new ProfileQuestionnaireContactWindowsDetailLevel1789893296516().up(runner)
    const sqlSansContactWindows = normalize(queries.join(' ')).replace(/contact_windows/g, '')
    expect(sqlSansContactWindows).not.toContain('ADD COLUMN IF NOT EXISTS contact_windows')
  })
})
