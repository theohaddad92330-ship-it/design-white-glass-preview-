import type { QueryRunner } from 'typeorm'
import { PrioritySectors1795100629471 } from '../1795100629471-PrioritySectors'

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

// #2041.1 — cinq niveaux par secteur : la colonne qui porte le niveau le plus fort.
describe('PrioritySectors1795100629471', () => {
  it('ajoute `priority_sectors`, text[], par défaut un tableau vide', async () => {
    const { runner, queries } = createRunner()
    await new PrioritySectors1795100629471().up(runner)
    expect(normalize(queries.join(' '))).toContain("ADD COLUMN IF NOT EXISTS priority_sectors text[] DEFAULT '{}'")
  })

  it('est rejouable : la montée passe par IF NOT EXISTS', async () => {
    const { runner, queries } = createRunner()
    await new PrioritySectors1795100629471().up(runner)
    const statements = normalize(queries.join(' '))
      .split(';')
      .map(statement => statement.trim())
      .filter(Boolean)
    expect(statements).toHaveLength(1)
    expect(statements[0]).toContain('IF NOT EXISTS')
  })

  it('AJOUT SEULEMENT : la montée ne touche à aucune colonne existante', async () => {
    // La garde qui compte ici (GA-11/GA-12) : `target_sectors`,
    // `reference_sectors` et `no_go_sectors` portent déjà des réponses réelles.
    // Une montée qui les renommerait ou les rétrécirait rendrait un retour en
    // arrière impossible — et le questionnaire les relit toutes les quatre.
    const { runner, queries } = createRunner()
    await new PrioritySectors1795100629471().up(runner)
    const sql = normalize(queries.join(' '))
    expect(sql).not.toContain('DROP')
    expect(sql).not.toContain('RENAME')
    for (const column of ['target_sectors', 'reference_sectors', 'no_go_sectors']) {
      expect(sql).not.toContain(column)
    }
  })

  it('sait redescendre, et ne redescend QUE sa propre colonne', async () => {
    const { runner, queries } = createRunner()
    await new PrioritySectors1795100629471().down(runner)
    const sql = normalize(queries.join(' '))
    expect(sql).toContain('DROP COLUMN IF EXISTS priority_sectors')
    expect(sql).not.toContain('reference_sectors')
  })
})
