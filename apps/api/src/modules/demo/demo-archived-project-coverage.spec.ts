import { DEMO_DELIVERY_CLIENT } from './demo-dataset'
import { DEMO_SEEDED_TABLES, DEMO_UX_ATOMIC_COVERAGE } from './demo-coverage'

describe('#4137 — la salle porte un dossier archivé (onglet « Archivés » du pipe)', () => {
  it('sème un dossier archivé, rangé APRÈS sa détection, sans montant inventé', () => {
    const archived = DEMO_DELIVERY_CLIENT.archivedProject
    expect(archived.label.length).toBeGreaterThan(0)
    expect(archived.archived_days_ago).toBeGreaterThan(0)
    expect(archived.detected_days_ago).toBeGreaterThan(archived.archived_days_ago)
    expect(archived).not.toHaveProperty('amount_cents')
  })

  it('classe la nouveauté, et `opportunities` reste une table seedée', () => {
    expect(DEMO_UX_ATOMIC_COVERAGE.state).toBe('seede')
    expect(DEMO_UX_ATOMIC_COVERAGE.reason).toContain('archivedProject')
    expect(DEMO_SEEDED_TABLES).toContain('opportunities')
  })
})
