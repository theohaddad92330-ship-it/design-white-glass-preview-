import type { QueryRunner } from 'typeorm'
import { ClientIdealInterlocuteursChemins1794011234567 } from '../1794011234567-ClientIdealInterlocuteursChemins'

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

const COLUMNS = [
  'ideal_client_size',
  'ideal_client_structure',
  'ideal_client_maturity',
  'ideal_client_territory',
  'ideal_client_accessibility',
  'ideal_client_max_sales_cycle',
  'ideal_client_min_deal_size',
  'ideal_client_referencement_constraints',
  'ideal_client_current_state',
  'real_response_level',
  'budget_validator',
  'access_orienteur',
  'entry_channels_used',
  'entry_channels_measured',
  'entry_channels_last_starts',
  'entry_channels_time_split',
  'entry_channels_dependency',
  'entry_channels_prerequisites',
  'entry_channels_saturation',
]

// #2042 / #2043 / #2044 — lot L17 : client idéal, interlocuteurs, chemins d'accès.
describe('ClientIdealInterlocuteursChemins1794011234567', () => {
  it('ajoute les 19 colonnes neuves, toutes nullables (aucun CHECK)', async () => {
    const { runner, queries } = createRunner()
    await new ClientIdealInterlocuteursChemins1794011234567().up(runner)
    const sql = normalize(queries.join(' '))

    for (const column of COLUMNS) {
      expect(sql).toContain(`ADD COLUMN IF NOT EXISTS ${column}`)
    }
    // Le questionnaire ne bloque jamais : aucune colonne NOT NULL.
    expect(sql).not.toMatch(/NOT NULL/)
  })

  it('est rejouable : tout passe par IF NOT EXISTS', async () => {
    const { runner, queries } = createRunner()
    await new ClientIdealInterlocuteursChemins1794011234567().up(runner)
    const statements = normalize(queries.join(' '))
      .split(';')
      .map(s => s.trim())
      .filter(Boolean)
    expect(statements.length).toBe(COLUMNS.length)
    for (const statement of statements) {
      expect(statement).toContain('IF NOT EXISTS')
    }
  })

  it('sait redescendre, chaque colonne ajoutée a son retrait', async () => {
    const { runner, queries } = createRunner()
    await new ClientIdealInterlocuteursChemins1794011234567().down(runner)
    const sql = normalize(queries.join(' '))
    for (const column of COLUMNS) {
      expect(sql).toContain(`DROP COLUMN IF EXISTS ${column}`)
    }
  })
})
