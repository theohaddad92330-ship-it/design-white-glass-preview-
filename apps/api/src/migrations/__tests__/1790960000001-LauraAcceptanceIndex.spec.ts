import type { QueryRunner } from 'typeorm'
import { LauraAcceptanceIndex1790960000001 } from '../1790960000001-LauraAcceptanceIndex'

/** Capture chaque instruction SQL émise (aucune base réelle n'est nécessaire). */
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

async function ranQueries(): Promise<string[]> {
  const { runner, queries } = createRunner()
  await new LauraAcceptanceIndex1790960000001().up(runner)
  return queries.map(normalize)
}

describe('LauraAcceptanceIndex1790960000001', () => {
  it('pose un index PARTIEL, idempotent, sur la fenêtre que lit le compteur d’acceptation', async () => {
    const queries = await ranQueries()
    const index = queries.find(q => q.includes('laura_interventions_acceptance_idx'))
    expect(index).toBeDefined()
    expect(index).toContain('CREATE INDEX IF NOT EXISTS laura_interventions_acceptance_idx')
    expect(index).toContain('ON laura_interventions (created_at)')
    // Partiel : ne couvre que les lignes que `LauraAcceptanceService.bySurface`
    // lit réellement — une réaction déjà posée. Un index plein perdrait ce
    // ciblage sans rien apporter à la requête.
    expect(index).toContain('WHERE reaction IS NOT NULL')
  })

  it('n’ajoute AUCUNE colonne — GA-36 ne s’applique pas à un index seul', async () => {
    const queries = await ranQueries()
    expect(queries.some(q => q.includes('ADD COLUMN'))).toBe(false)
    expect(queries.some(q => q.includes('CREATE TABLE'))).toBe(false)
  })

  it('down() ne retire QUE l’index qu’elle a posé', async () => {
    const { runner, queries } = createRunner()
    await new LauraAcceptanceIndex1790960000001().down(runner)
    expect(queries.map(normalize)).toEqual(['DROP INDEX IF EXISTS laura_interventions_acceptance_idx'])
  })
})
