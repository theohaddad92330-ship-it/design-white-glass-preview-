import type { QueryRunner } from 'typeorm'
import { TOOLING_MAP_KEYS } from '@bellum/contracts'
import { OutillageCartographie1794024402918 } from '../1794024402918-OutillageCartographie'

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

// #2054 — lot G4 : la cartographie de la chaîne d'outillage.
describe('OutillageCartographie1794024402918', () => {
  it('ajoute une colonne PAR MAILLON — la liste vient du contrat, pas d’une copie', async () => {
    // Si un maillon s'ajoute côté contrat sans colonne ici, la réponse serait
    // acceptée par le schéma puis perdue à l'écriture, en silence.
    expect(TOOLING_MAP_KEYS.length).toBe(11)
    const { runner, queries } = createRunner()
    await new OutillageCartographie1794024402918().up(runner)
    const sql = normalize(queries.join(' '))
    for (const column of TOOLING_MAP_KEYS) {
      expect(sql).toContain(`ADD COLUMN IF NOT EXISTS ${column} text`)
    }
  })

  it('ajoute les sept attributs de la source de référence', async () => {
    const { runner, queries } = createRunner()
    await new OutillageCartographie1794024402918().up(runner)
    const sql = normalize(queries.join(' '))
    for (const column of [
      'tooling_reference',
      'tooling_reference_freshness',
      'tooling_reference_confidence',
      'tooling_reference_export',
      'tooling_duplicates',
      'tooling_pain',
    ]) {
      expect(sql).toContain(`ADD COLUMN IF NOT EXISTS ${column} text`)
    }
    // Le seul tableau du lot : ce que la source CONTIENT (#2054.13).
    expect(sql).toContain("ADD COLUMN IF NOT EXISTS tooling_reference_data text[] NOT NULL DEFAULT '{}'")
  })

  it('ne rend AUCUNE colonne de texte obligatoire : une question passée reste NULL', async () => {
    // « Non mesuré » n'est pas « 0 » : le questionnaire ne bloque jamais.
    const { runner, queries } = createRunner()
    await new OutillageCartographie1794024402918().up(runner)
    const sql = normalize(queries.join(' '))
    expect(sql).not.toMatch(/ADD COLUMN IF NOT EXISTS [a-z_]+ text NOT NULL/)
    // Aucune contrainte de valeur : le catalogue fermé vit dans les contrats.
    expect(sql).not.toContain('CHECK')
  })

  it('ne touche PAS `tooling`, le tableau plat du profil progressif', async () => {
    const { runner, queries } = createRunner()
    await new OutillageCartographie1794024402918().up(runner)
    const sql = normalize(queries.join(' '))
    expect(sql).not.toMatch(/(ADD|DROP) COLUMN IF (NOT )?EXISTS tooling(?![_a-z])/)
  })

  it('est rejouable : dix-huit instructions, toutes en IF NOT EXISTS', async () => {
    const { runner, queries } = createRunner()
    await new OutillageCartographie1794024402918().up(runner)
    const statements = normalize(queries.join(' '))
      .split(';')
      .map(s => s.trim())
      .filter(Boolean)
    expect(statements.length).toBe(18)
    for (const statement of statements) {
      expect(statement).toContain('IF NOT EXISTS')
    }
  })

  it('sait redescendre', async () => {
    const { runner, queries } = createRunner()
    await new OutillageCartographie1794024402918().down(runner)
    const sql = normalize(queries.join(' '))
    expect(sql).toContain('DROP COLUMN IF EXISTS tooling_crm')
    expect(sql).toContain('DROP COLUMN IF EXISTS tooling_pain')
  })
})
