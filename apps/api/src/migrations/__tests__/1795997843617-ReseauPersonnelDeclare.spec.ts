import type { QueryRunner } from 'typeorm'
import { ReseauPersonnelDeclare1795997843617 } from '../1795997843617-ReseauPersonnelDeclare'

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

const NEW_COLUMNS = [
  'former_clients_count_band',
  'former_colleagues_count_band',
  'partners_count_band',
  'referrers_count_band',
]

// #2045.1/.2/.4/.7 — réseau personnel DÉCLARÉ à l'onboarding.
describe('ReseauPersonnelDeclare1795997843617', () => {
  it('ajoute les 4 colonnes neuves, toutes nullables (aucun CHECK)', async () => {
    const { runner, queries } = createRunner()
    await new ReseauPersonnelDeclare1795997843617().up(runner)
    const sql = normalize(queries.join(' '))

    for (const column of NEW_COLUMNS) {
      expect(sql).toContain(`ADD COLUMN IF NOT EXISTS ${column} text`)
    }
    // Le questionnaire ne bloque jamais : aucune colonne NOT NULL.
    expect(sql).not.toMatch(/ADD COLUMN IF NOT EXISTS [a-z_]+ text NOT NULL/)
  })

  it('est rejouable : tout passe par IF NOT EXISTS', async () => {
    const { runner, queries } = createRunner()
    await new ReseauPersonnelDeclare1795997843617().up(runner)
    const statements = normalize(queries.join(' '))
      .split(';')
      .map(s => s.trim())
      .filter(Boolean)
    expect(statements.length).toBe(NEW_COLUMNS.length)
    for (const statement of statements) {
      expect(statement).toContain('IF NOT EXISTS')
    }
  })

  it('sait redescendre', async () => {
    const { runner, queries } = createRunner()
    await new ReseauPersonnelDeclare1795997843617().down(runner)
    const sql = normalize(queries.join(' '))
    for (const column of NEW_COLUMNS) {
      expect(sql).toContain(`DROP COLUMN IF EXISTS ${column}`)
    }
  })
})
