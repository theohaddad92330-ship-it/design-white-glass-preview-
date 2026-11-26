import type { QueryRunner } from 'typeorm'
import { TempsReelEtRoutines1794023117482 } from '../1794023117482-TempsReelEtRoutines'

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

// #2050 / #2051 — lot L19 : capacité réelle + continuité des dossiers.
describe('TempsReelEtRoutines1794023117482', () => {
  const SIMPLE = [
    'weekly_sales_time_declared',
    'weekly_sales_time_protected',
    'weekly_sales_time_residual',
    'workload_variability',
    'protected_slot_capacity',
  ]
  const LISTS = [
    'weekly_sales_time_slots',
    'competing_workloads',
    'dossier_continuity_practices',
    'dossier_continuity_breaks',
  ]

  it('ajoute les 9 colonnes neuves', async () => {
    const { runner, queries } = createRunner()
    await new TempsReelEtRoutines1794023117482().up(runner)
    const sql = normalize(queries.join(' '))

    for (const column of SIMPLE) expect(sql).toContain(`ADD COLUMN IF NOT EXISTS ${column} text;`)
    for (const column of LISTS) {
      expect(sql).toContain(`ADD COLUMN IF NOT EXISTS ${column} text[] NOT NULL DEFAULT '{}'`)
    }
  })

  it('laisse NULLABLE toute colonne de choix simple — le questionnaire ne bloque jamais', async () => {
    const { runner, queries } = createRunner()
    await new TempsReelEtRoutines1794023117482().up(runner)
    const sql = normalize(queries.join(' '))
    // Une colonne `text NOT NULL` obligerait à écrire une valeur de remplissage
    // pour les profils existants : « non mesuré » deviendrait une chaîne vide.
    expect(sql).not.toMatch(/ADD COLUMN IF NOT EXISTS [a-z_]+ text NOT NULL/)
  })

  it('garde les TROIS états du temps séparés (#2050.11/.12/.13)', async () => {
    const { runner, queries } = createRunner()
    await new TempsReelEtRoutines1794023117482().up(runner)
    const sql = normalize(queries.join(' '))
    // Le témoin de la règle : trois colonnes, pas une. Fondre les trois états
    // en une seule colonne forcerait le produit à choisir laquelle des trois
    // vérités il garde — le chiffre faux que #2050 combat.
    const declared = sql.includes('weekly_sales_time_declared')
    const protectedTime = sql.includes('weekly_sales_time_protected')
    const residual = sql.includes('weekly_sales_time_residual')
    expect([declared, protectedTime, residual]).toEqual([true, true, true])
  })

  it('est rejouable : tout passe par IF NOT EXISTS', async () => {
    const { runner, queries } = createRunner()
    await new TempsReelEtRoutines1794023117482().up(runner)
    const statements = normalize(queries.join(' '))
      .split(';')
      .map(s => s.trim())
      .filter(Boolean)
    expect(statements.length).toBe(SIMPLE.length + LISTS.length)
    for (const statement of statements) expect(statement).toContain('IF NOT EXISTS')
  })

  it("n'ajoute QUE des colonnes : aucun DROP, aucun ALTER de contrainte dans la montée", async () => {
    const { runner, queries } = createRunner()
    await new TempsReelEtRoutines1794023117482().up(runner)
    const sql = normalize(queries.join(' '))
    expect(sql).not.toContain('DROP')
    expect(sql).not.toContain('CHECK')
  })

  it('sait redescendre', async () => {
    const { runner, queries } = createRunner()
    await new TempsReelEtRoutines1794023117482().down(runner)
    const sql = normalize(queries.join(' '))
    for (const column of [...SIMPLE, ...LISTS]) {
      expect(sql).toContain(`DROP COLUMN IF EXISTS ${column}`)
    }
  })
})
