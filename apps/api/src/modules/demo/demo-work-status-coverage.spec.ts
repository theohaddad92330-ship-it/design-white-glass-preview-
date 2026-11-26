import { DEMO_ANALYSIS_BATCH, DEMO_INTEGRATION_SYNC_RUN } from './demo-dataset'
import { DEMO_INTENTIONALLY_EMPTY, DEMO_SEEDED_TABLES } from './demo-coverage'

/**
 * #4611 (craft rule n°9) — « où en est le travail lancé ? » est rempli en démonstration : l'outil `get_work_progress`
 * (qui a remplacé `get_work_status`, retiré le 28/10 sur arbitrage
 * de Louis — la garde est re-pointée, pas supprimée) lit
 * les sources que la démo SEME déjà (lots d'analyses, imports, dernier run de synchronisation). Rien de
 * nouveau à semer, et rien n'est déplacé vers « vide à dessein » : cette garde le prouve sur le jeu réel.
 */
describe('démo — état du travail lancé (#4611)', () => {
  it('les quatre tables que l’outil lit sont SEMÉES, aucune n’est « vide à dessein »', () => {
    for (const table of [
      'analysis_batches',
      'analysis_batch_items',
      'universal_import_jobs',
      'integration_sync_runs',
    ]) {
      expect(DEMO_SEEDED_TABLES as readonly string[]).toContain(table)
      expect(Object.keys(DEMO_INTENTIONALLY_EMPTY)).not.toContain(table)
    }
  })

  it('le lot semé donne à Laura de quoi répondre : des sous-jobs, dont un à confirmer, avec leurs noms', () => {
    expect(DEMO_ANALYSIS_BATCH.ambiguous.name.length).toBeGreaterThan(0)
    expect(DEMO_ANALYSIS_BATCH.ambiguous.candidates.length).toBeGreaterThan(0)
    expect(DEMO_ANALYSIS_BATCH.needsResolution.candidates.length).toBeGreaterThan(0)
  })

  it('la synchronisation semée est un run TERMINÉ nommant son connecteur', () => {
    expect(DEMO_INTEGRATION_SYNC_RUN.provider.length).toBeGreaterThan(0)
    expect(DEMO_INTEGRATION_SYNC_RUN.finished_minutes_ago).toBeLessThan(DEMO_INTEGRATION_SYNC_RUN.started_minutes_ago)
  })
})
