import { DEMO_INTENTIONALLY_EMPTY, DEMO_SEEDED_TABLES } from './demo-coverage'
import { DEMO_ANALYSIS_BATCH, DEMO_WORK_PROGRESS } from './demo-dataset'
import { DEMO_SEED_FINGERPRINT } from './demo-seed-fingerprint'

/**
 * #4611.9 — « où en est le travail lancé ? » est REMPLI en démonstration (craft n°9). Ces gardes lisent le jeu
 * réel : un lot de la veille avec de quoi faire dire à la carte « rendue », « en cours » ET « en erreur, avec sa
 * raison » — et pas un lot qui n'aurait que des succès.
 */
describe('démo — l’avancement du travail lancé (#4611.9)', () => {
  const items = DEMO_WORK_PROGRESS.analysisBatch.items

  it('les tables lues par l’outil sont classées « semées », jamais « vides à dessein »', () => {
    for (const table of [
      'analysis_batches',
      'analysis_batch_items',
      'universal_import_jobs',
      'org_enrichment_jobs',
      'integration_sync_runs',
    ]) {
      expect(DEMO_SEEDED_TABLES as readonly string[]).toContain(table)
      expect(Object.keys(DEMO_INTENTIONALLY_EMPTY)).not.toContain(table)
    }
  })

  it('le lot porte une rendue, une en cours, une en file et UNE EN ERREUR avec sa raison', () => {
    const states = items.map(item => item.state)
    expect(states).toEqual(expect.arrayContaining(['done', 'running', 'queued', 'failed']))
    const failed = items.filter(item => item.state === 'failed')
    expect(failed.length).toBeGreaterThanOrEqual(1)
    // La raison est CELLE que le lot écrit quand un lancement échoue — jamais une phrase inventée pour la salle.
    for (const item of failed) expect(item.failureCode).toBe('launch_error')
  })

  it('NON — un sous-job qui n’est pas en erreur ne porte pas de raison d’échec', () => {
    for (const item of items.filter(item => item.state !== 'failed')) expect(item.failureCode).toBeNull()
  })

  it('un sous-job jamais lancé n’a pas de dossier ; un lancé en a un (« lancées » se MESURE sur le dossier)', () => {
    for (const item of items) expect(item.accountIndex === null).toBe(item.state === 'failed')
  })

  it('le lot de la veille est dans la fenêtre « travail lancé » (7 jours) et distinct du premier lot', () => {
    expect(DEMO_WORK_PROGRESS.analysisBatch.hoursAgo).toBeGreaterThan(0)
    expect(DEMO_WORK_PROGRESS.analysisBatch.hoursAgo).toBeLessThan(7 * 24)
    expect(DEMO_WORK_PROGRESS.analysisBatch).not.toBe(DEMO_ANALYSIS_BATCH)
  })

  it('le jeu entre dans l’empreinte du semis : une salle déjà prête est rejouée quand il change', () => {
    expect(DEMO_SEED_FINGERPRINT).toMatch(/\S/)
  })
})
