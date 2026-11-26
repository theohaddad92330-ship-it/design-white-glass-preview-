import type { QueryRunner } from 'typeorm'
import { VivierEtBaseClients1794210000000 } from '../1794210000000-VivierEtBaseClients'

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
  'talent_pool_identified_band',
  'talent_pool_qualified_band',
  'talent_pool_available_band',
  'talent_pool_availability_recency_band',
  'talent_pool_avg_tjm_band',
  'talent_pool_mobility_band',
  'talent_pool_consent_status',
  'talent_pool_other_processes_band',
  'talent_pool_engagement_reality_band',
  'talent_pool_revalidation_frequency',
  'talent_pool_state_interested_band',
  'talent_pool_state_available_band',
  'talent_pool_state_secured_band',
  'talent_pool_state_presentable_band',
  'client_base_missions_ongoing_band',
  'client_base_missions_completed_band',
  'client_base_renewals_band',
  'client_base_satisfaction_band',
  'client_base_referrals_band',
  'client_base_rex_band',
  'client_base_case_studies_band',
  'client_base_cross_sell_band',
  'client_base_deadlines_band',
  'client_base_followup_regularity',
  'client_base_followup_owner',
]

// #2046 / #2047 — vivier de consultants et base de clients DÉCLARÉS à
// l'onboarding.
describe('VivierEtBaseClients1794210000000', () => {
  it('ajoute les 25 colonnes neuves, toutes nullables (aucun CHECK)', async () => {
    const { runner, queries } = createRunner()
    await new VivierEtBaseClients1794210000000().up(runner)
    const sql = normalize(queries.join(' '))

    for (const column of NEW_COLUMNS) {
      expect(sql).toContain(`ADD COLUMN IF NOT EXISTS ${column} text`)
    }
    // Le questionnaire ne bloque jamais : aucune colonne NOT NULL.
    expect(sql).not.toMatch(/ADD COLUMN IF NOT EXISTS [a-z_]+ text NOT NULL/)
  })

  it('est rejouable : tout passe par IF NOT EXISTS', async () => {
    const { runner, queries } = createRunner()
    await new VivierEtBaseClients1794210000000().up(runner)
    const statements = normalize(queries.join(' '))
      .split(';')
      .map(s => s.trim())
      .filter(Boolean)
    expect(statements.length).toBe(NEW_COLUMNS.length)
    for (const statement of statements) {
      expect(statement).toContain('IF NOT EXISTS')
    }
  })

  it('ne touche PAS `client_base_active_accounts_band` (#2047.1) : `active_clients_band` porte déjà cette réponse depuis 1794010000000', async () => {
    const { runner, queries } = createRunner()
    await new VivierEtBaseClients1794210000000().up(runner)
    const sql = normalize(queries.join(' '))
    expect(sql).not.toContain('client_base_active_accounts_band')
    expect(sql).not.toContain('active_clients_band')
  })

  it('sait redescendre', async () => {
    const { runner, queries } = createRunner()
    await new VivierEtBaseClients1794210000000().down(runner)
    const sql = normalize(queries.join(' '))
    for (const column of NEW_COLUMNS) {
      expect(sql).toContain(`DROP COLUMN IF EXISTS ${column}`)
    }
  })
})
