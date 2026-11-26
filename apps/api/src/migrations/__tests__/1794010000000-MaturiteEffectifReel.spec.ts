import type { QueryRunner } from 'typeorm'
import { MaturiteEffectifReel1794010000000 } from '../1794010000000-MaturiteEffectifReel'

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

// #2034 / #2035 — lot L15 : maturité commerciale + effectif réel décomposé.
describe('MaturiteEffectifReel1794010000000', () => {
  it('ajoute les 6 colonnes neuves, toutes nullables (aucun CHECK)', async () => {
    const { runner, queries } = createRunner()
    await new MaturiteEffectifReel1794010000000().up(runner)
    const sql = normalize(queries.join(' '))

    for (const column of [
      'esn_maturity_situation',
      'active_clients_band',
      'revenue_recurrence',
      'client_concentration_risk',
      'company_growth_goal',
      'consultants_managed_by_user_band',
    ]) {
      expect(sql).toContain(`ADD COLUMN IF NOT EXISTS ${column} text`)
    }
    // Le questionnaire ne bloque jamais : aucune colonne NOT NULL.
    expect(sql).not.toMatch(/ADD COLUMN IF NOT EXISTS [a-z_]+ text NOT NULL/)
  })

  it('est rejouable : tout passe par IF NOT EXISTS', async () => {
    const { runner, queries } = createRunner()
    await new MaturiteEffectifReel1794010000000().up(runner)
    const statements = normalize(queries.join(' '))
      .split(';')
      .map(s => s.trim())
      .filter(Boolean)
    expect(statements.length).toBe(6)
    for (const statement of statements) {
      expect(statement).toContain('IF NOT EXISTS')
    }
  })

  it('ne touche PAS `available_consultants_band` (#2035.5) : la colonne existe déjà depuis 1780000000000', async () => {
    const { runner, queries } = createRunner()
    await new MaturiteEffectifReel1794010000000().up(runner)
    const sql = normalize(queries.join(' '))
    expect(sql).not.toContain('available_consultants_band')
  })

  it('sait redescendre', async () => {
    const { runner, queries } = createRunner()
    await new MaturiteEffectifReel1794010000000().down(runner)
    const sql = normalize(queries.join(' '))
    expect(sql).toContain('DROP COLUMN IF EXISTS esn_maturity_situation')
    expect(sql).toContain('DROP COLUMN IF EXISTS consultants_managed_by_user_band')
  })
})
