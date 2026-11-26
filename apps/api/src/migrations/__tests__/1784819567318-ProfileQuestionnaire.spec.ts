import type { QueryRunner } from 'typeorm'
import { ProfileQuestionnaire1784819567318 } from '../1784819567318-ProfileQuestionnaire'

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

describe('ProfileQuestionnaire1784819567318', () => {
  it('ajoute les 27 champs du profil progressif, tous nullables', async () => {
    const { runner, queries } = createRunner()
    await new ProfileQuestionnaire1784819567318().up(runner)
    const sql = normalize(queries.join(' '))

    // Un échantillon par bloc du rapport (§21-30).
    for (const column of [
      'user_role',
      'monthly_target',
      'consultants_in_pipe',
      'avg_deal_size',
      'accounts_relationship_status',
      'weekly_linkedin',
      'proactivity_level',
    ]) {
      expect(sql).toContain(`ADD COLUMN IF NOT EXISTS ${column} text`)
    }
    // Aucune contrainte NOT NULL sur un champ texte : le questionnaire ne
    // bloque jamais, une question passée reste NULL.
    expect(sql).not.toMatch(/ADD COLUMN IF NOT EXISTS [a-z_]+ text NOT NULL/)
  })

  it('donne aux champs multi-choix un tableau vide par défaut, jamais NULL', async () => {
    const { runner, queries } = createRunner()
    await new ProfileQuestionnaire1784819567318().up(runner)
    const sql = normalize(queries.join(' '))
    for (const column of ['go_to_market_channels', 'sales_routine', 'sales_blockers', 'tooling', 'shared_data_scope']) {
      expect(sql).toContain(`ADD COLUMN IF NOT EXISTS ${column} text[] NOT NULL DEFAULT '{}'`)
    }
  })

  it('est rejouable : tout passe par IF NOT EXISTS', async () => {
    const { runner, queries } = createRunner()
    await new ProfileQuestionnaire1784819567318().up(runner)
    const statements = normalize(queries.join(' '))
      .split(';')
      .map(s => s.trim())
      .filter(Boolean)
    expect(statements.length).toBe(27)
    for (const statement of statements) {
      expect(statement).toContain('IF NOT EXISTS')
    }
  })

  it('sait redescendre', async () => {
    const { runner, queries } = createRunner()
    await new ProfileQuestionnaire1784819567318().down(runner)
    const sql = normalize(queries.join(' '))
    expect(sql).toContain('DROP COLUMN IF EXISTS user_role')
    expect(sql).toContain('DROP COLUMN IF EXISTS shared_data_scope')
  })
})
