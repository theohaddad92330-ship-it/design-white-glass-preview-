import { DEMO_INTENTIONALLY_EMPTY, DEMO_SEEDED_TABLES } from './demo-coverage'
import { DEMO_MISSION_SAVED_VIEW, DemoSeedService } from './demo-seed.service'

/**
 * #2979 (recette prod 03/10) — « Aucune BU en prod, vue enregistrée non jouée » : l'écran des
 * filtres de /missions s'ouvrait sans une seule vue à rejouer en démonstration. La salle en
 * sème UNE (scope `missions`). Sait dire NON : la retirer, ou la classer à la fois « semée » et
 * « vide à dessein », fait rougir.
 */
describe('#2979 — une vue enregistrée de « Missions » en salle', () => {
  it('est classée semée, et plus « vide à dessein » (jamais les deux)', () => {
    expect(DEMO_SEEDED_TABLES).toContain('saved_views')
    expect(Object.keys(DEMO_INTENTIONALLY_EMPTY)).not.toContain('saved_views')
  })

  it('porte un critère réel (jamais une vue vide : « elle existe déjà »), reconnu par l’écran', () => {
    expect(DEMO_MISSION_SAVED_VIEW.filters.facets.length).toBeGreaterThan(0)
    // Les facettes que `MissionsPage` sait relire (`MISSION_FACETS`, apps/web/src/features/missions/filters.ts).
    for (const facet of DEMO_MISSION_SAVED_VIEW.filters.facets) {
      expect(['toRenew', 'noEndDate', 'withRisk', 'marginAtRisk', 'consultantsSoonAvailable']).toContain(facet)
    }
  })

  it('est écrite par le semis de la salle, scope `missions`, au nom du propriétaire, non partagée', async () => {
    const query = jest.fn(async () => [])
    const service = Object.create(DemoSeedService.prototype) as {
      accounts: { manager: { query: typeof query } }
      seedMissionSavedView: (workspaceId: string, ownerUserId: string) => Promise<void>
    }
    service.accounts = { manager: { query } }
    await service.seedMissionSavedView('ws-1', 'owner-1')
    const [sql, params] = query.mock.calls[0] as unknown as [string, unknown[]]
    expect(sql).toContain('INSERT INTO saved_views')
    expect(sql).toContain("'missions'")
    expect(params).toEqual(['ws-1', 'owner-1', 'Missions à renouveler', JSON.stringify({ facets: ['toRenew'] })])
  })
})
