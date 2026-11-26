import type { QueryRunner } from 'typeorm'
import { ANALYSIS_BATCH_ITEM_STATES } from '@bellum/contracts'
import { AnalysisBatchItemNeedsResolution1796322029417 } from '../1796322029417-AnalysisBatchItemNeedsResolution'

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

describe('AnalysisBatchItemNeedsResolution1796322029417', () => {
  // #2283.32 — un sous-job dont l'analyse a abouti mais dont le Résolveur
  // d'identité (#2284) reste ambigu doit pouvoir s'écrire `needs_resolution`,
  // sans quoi Postgres rejette la mise à jour à chaque lecture du lot.
  it('autorise `needs_resolution` sur `analysis_batch_items.state`', async () => {
    const { runner, queries } = createRunner()
    await new AnalysisBatchItemNeedsResolution1796322029417().up(runner)
    const flat = queries.map(normalize)
    expect(flat).toContain(
      'ALTER TABLE analysis_batch_items DROP CONSTRAINT IF EXISTS analysis_batch_items_state_check',
    )
    const add = flat.find(q => q.includes('ADD CONSTRAINT analysis_batch_items_state_check'))
    expect(add).toBeDefined()
    expect(add).toContain("'needs_resolution'")
  })

  it('n’en retire aucune : toutes les valeurs de la contrainte précédente restent autorisées (GA-08)', async () => {
    const { runner, queries } = createRunner()
    await new AnalysisBatchItemNeedsResolution1796322029417().up(runner)
    const add = queries.map(normalize).find(q => q.includes('ADD CONSTRAINT analysis_batch_items_state_check'))
    for (const previous of ['resolved', 'to_confirm', 'queued', 'running', 'partial', 'done', 'failed', 'canceled']) {
      expect(add).toContain(`'${previous}'`)
    }
  })

  it('le CHECK reste synchronisé avec le contrat zod (aucune valeur oubliée)', async () => {
    const { runner, queries } = createRunner()
    await new AnalysisBatchItemNeedsResolution1796322029417().up(runner)
    const add = queries.map(normalize).find(q => q.includes('ADD CONSTRAINT analysis_batch_items_state_check'))
    expect(ANALYSIS_BATCH_ITEM_STATES.length).toBeGreaterThan(0)
    for (const state of ANALYSIS_BATCH_ITEM_STATES) {
      expect(add).toContain(`'${state}'`)
    }
  })
})
