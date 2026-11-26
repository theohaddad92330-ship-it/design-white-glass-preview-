import { ANALYSIS_BATCH_SOURCES } from '@bellum/contracts'
import type { QueryRunner } from 'typeorm'
import { AnalysisBatches1796000544454 } from '../1796000544454-AnalysisBatches'

/**
 * Les états du contrat TELS QU'ILS ÉTAIENT à la naissance de cette migration
 * (GA-11) — pas `ANALYSIS_BATCH_ITEM_STATES` en direct : un état ajouté PLUS
 * TARD (`needs_resolution`, #2283.32) élargit le CHECK par une migration
 * SUIVANTE (`1796322029417-AnalysisBatchItemNeedsResolution`, qui a sa propre
 * garde de synchronisation), jamais celle-ci — une migration déjà exécutée ne
 * se réécrit pas.
 */
const STATES_AT_BIRTH = ['resolved', 'to_confirm', 'queued', 'running', 'partial', 'done', 'failed', 'canceled']

async function upSql(): Promise<string> {
  const queries: string[] = []
  const runner = {
    query: jest.fn(async (sql: string) => {
      queries.push(sql.replace(/\s+/g, ' ').trim())
      return []
    }),
  } as unknown as QueryRunner
  await new AnalysisBatches1796000544454().up(runner)
  return queries.join('\n')
}

/** #2293.5 / .6 — le lot d'analyses : un parent, un sous-job par entreprise. */
describe('AnalysisBatches1796000544454', () => {
  it('la contrainte d’état couvre les huit états du contrat (GA-11 : elle naît AVEC la colonne)', async () => {
    const sql = await upSql()
    const check = sql.split('CONSTRAINT ').find(part => part.startsWith('analysis_batch_items_state_check')) ?? ''
    for (const state of STATES_AT_BIRTH) expect(check).toContain(`'${state}'`)
  })

  it('la contrainte de source couvre les huit sources du contrat', async () => {
    const sql = await upSql()
    const check = sql.split('CONSTRAINT ').find(part => part.startsWith('analysis_batches_source_check')) ?? ''
    for (const source of ANALYSIS_BATCH_SOURCES) expect(check).toContain(`'${source}'`)
  })

  it('un sous-job RÉFÉRENCE son compte sans le supprimer avec lui (on archive, on ne supprime pas)', async () => {
    const sql = await upSql()
    expect(sql).toContain('account_id uuid NULL REFERENCES accounts(id) ON DELETE SET NULL')
    expect(sql).toContain('batch_id uuid NOT NULL REFERENCES analysis_batches(id) ON DELETE CASCADE')
  })

  it('active la RLS sur les deux tables', async () => {
    const sql = await upSql()
    expect(sql).toContain('ALTER TABLE analysis_batches ENABLE ROW LEVEL SECURITY')
    expect(sql).toContain('ALTER TABLE analysis_batch_items ENABLE ROW LEVEL SECURITY')
  })
})
