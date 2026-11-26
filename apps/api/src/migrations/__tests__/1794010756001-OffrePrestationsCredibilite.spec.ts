import type { QueryRunner } from 'typeorm'
import { OffrePrestationsCredibilite1794010756001 } from '../1794010756001-OffrePrestationsCredibilite'

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
  'service_types',
  'service_types_proven',
  'service_types_desired',
  'reference_sectors',
  'case_study_results',
  'client_testimonials',
  'staffing_modes',
  'profile_validation_methods',
  'contractual_constraints',
]

// Lot 26 (#2038, #2039, #2040, #2041) — offre en types de prestation,
// secteurs référencés, crédibilité et modes de réponse au besoin.
describe('OffrePrestationsCredibilite1794010756001', () => {
  it('ajoute les 9 colonnes neuves, en tableau vide par défaut (aucun CHECK)', async () => {
    const { runner, queries } = createRunner()
    await new OffrePrestationsCredibilite1794010756001().up(runner)
    const sql = normalize(queries.join(' '))

    for (const column of COLUMNS) {
      expect(sql).toContain(`ADD COLUMN IF NOT EXISTS ${column} text[] DEFAULT '{}'`)
    }
    // Le questionnaire ne bloque jamais : aucune colonne NOT NULL.
    expect(sql).not.toMatch(/ADD COLUMN IF NOT EXISTS [a-z_]+ text\[\] NOT NULL/)
  })

  it('est rejouable : tout passe par IF NOT EXISTS', async () => {
    const { runner, queries } = createRunner()
    await new OffrePrestationsCredibilite1794010756001().up(runner)
    const statements = normalize(queries.join(' '))
      .split(';')
      .map(s => s.trim())
      .filter(Boolean)
    expect(statements.length).toBe(COLUMNS.length)
    for (const statement of statements) {
      expect(statement).toContain('IF NOT EXISTS')
    }
  })

  it('sait redescendre — les 9 colonnes, jamais une de plus (témoin de non-fuite)', async () => {
    const { runner, queries } = createRunner()
    await new OffrePrestationsCredibilite1794010756001().down(runner)
    const sql = normalize(queries.join(' '))
    for (const column of COLUMNS) {
      expect(sql).toContain(`DROP COLUMN IF EXISTS ${column}`)
    }
    // SAIT DIRE NON : une colonne d'un autre lot ne doit jamais apparaître ici.
    expect(sql).not.toContain('available_consultants_band')
  })
})
