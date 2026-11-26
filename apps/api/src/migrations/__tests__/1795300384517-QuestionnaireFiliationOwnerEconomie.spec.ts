import type { QueryRunner } from 'typeorm'
import { QuestionnaireFiliationOwnerEconomie1795300384517 } from '../1795300384517-QuestionnaireFiliationOwnerEconomie'

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

const COLUMNS = ['company_group_structure', 'rfp_deal_value', 'rfp_owner_assignment']

// #2015.7 (filiation) / #2056.11 (économie du dossier) / #2057.10 (owner).
describe('QuestionnaireFiliationOwnerEconomie1795300384517', () => {
  it('ajoute les 3 colonnes neuves : texte NULLABLE, aucun tableau', async () => {
    const { runner, queries } = createRunner()
    await new QuestionnaireFiliationOwnerEconomie1795300384517().up(runner)
    const sql = normalize(queries.join(' '))

    for (const column of COLUMNS) {
      expect(sql).toContain(`ADD COLUMN IF NOT EXISTS ${column} text;`)
    }
  })

  it('est rejouable : tout passe par IF NOT EXISTS, une instruction par colonne', async () => {
    const { runner, queries } = createRunner()
    await new QuestionnaireFiliationOwnerEconomie1795300384517().up(runner)
    const statements = normalize(queries.join(' '))
      .split(';')
      .map(s => s.trim())
      .filter(Boolean)
    expect(statements.length).toBe(COLUMNS.length)
    for (const statement of statements) {
      expect(statement).toContain('IF NOT EXISTS')
    }
  })

  it('sait redescendre — les 3 colonnes, jamais une de plus (témoin de non-fuite)', async () => {
    const { runner, queries } = createRunner()
    await new QuestionnaireFiliationOwnerEconomie1795300384517().down(runner)
    const sql = normalize(queries.join(' '))
    for (const column of COLUMNS) {
      expect(sql).toContain(`DROP COLUMN IF EXISTS ${column}`)
    }
    const statements = sql
      .split(';')
      .map(s => s.trim())
      .filter(Boolean)
    expect(statements.length).toBe(COLUMNS.length)
  })
})
