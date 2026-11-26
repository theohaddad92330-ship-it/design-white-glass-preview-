import { DEMO_INTENTIONALLY_EMPTY, DEMO_SEEDED_TABLES } from './demo-coverage'
import { DEMO_DISCOVER_SAVED_VIEWS, DemoSeedService } from './demo-seed.service'

/**
 * Théo decouvrir-historique — « Mes recherches » ne s'ouvre pas sur un bloc « Enregistrées » vide en salle.
 * Sait dire NON : retirer les recherches semées, ou les classer à la fois « semées » et « vides à dessein »,
 * fait rougir.
 */
describe('Théo decouvrir-historique — les recherches enregistrées de Découvrir en salle', () => {
  it('est classée semée, et plus « vide à dessein » (jamais les deux)', () => {
    expect(DEMO_SEEDED_TABLES).toContain('saved_views')
    expect(Object.keys(DEMO_INTENTIONALLY_EMPTY)).not.toContain('saved_views')
  })

  it('sème trois recherches aux critères réels, dont une partagée rejouée à cadence', () => {
    expect(DEMO_DISCOVER_SAVED_VIEWS).toHaveLength(5)
    for (const view of DEMO_DISCOVER_SAVED_VIEWS) {
      expect(Object.keys(view.filters).length).toBeGreaterThan(0)
      expect(view.objective.length).toBeGreaterThan(0)
    }
    expect(DEMO_DISCOVER_SAVED_VIEWS.some(view => view.shared && view.alertFrequency !== 'manual')).toBe(true)
  })

  it('ne promet AUCUN envoi sortant : une cadence se livre dans l’application, jamais par e-mail', () => {
    for (const view of DEMO_DISCOVER_SAVED_VIEWS) {
      expect(['manual', 'weekly']).toContain(view.alertFrequency)
      expect(view.alertChannel === null || view.alertChannel === 'in_app').toBe(true)
    }
  })

  it('est écrite par le semis de la salle, scope `discover`, au nom du propriétaire', async () => {
    const query = jest.fn(async () => [])
    const service = Object.create(DemoSeedService.prototype) as {
      accounts: { manager: { query: typeof query } }
      seedDiscoverSavedViews: (workspaceId: string, ownerUserId: string) => Promise<void>
    }
    service.accounts = { manager: { query } }
    await service.seedDiscoverSavedViews('ws-1', 'owner-1')
    expect(query).toHaveBeenCalledTimes(5)
    const [sql, params] = query.mock.calls[0] as unknown as [string, unknown[]]
    expect(sql).toContain('INSERT INTO saved_views')
    expect(sql).toContain("'discover'")
    expect(params.slice(0, 3)).toEqual(['ws-1', 'owner-1', 'SAP · France'])
  })
})
