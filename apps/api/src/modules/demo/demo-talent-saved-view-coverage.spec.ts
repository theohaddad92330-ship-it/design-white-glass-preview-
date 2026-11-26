import { talentSearchQuerySchema } from '@bellum/contracts'
import { DEMO_TALENT_SAVED_VIEW, DemoSeedService } from './demo-seed.service'

/**
 * Louis 23/10 (lot R23-N-WEB-A) — « Mes vues » revient dans la barre du vivier (`VivierMyViews`). Craft rule n°9 : en
 * salle, le menu ne s'ouvre pas sur la seule ligne « Enregistrer la vue courante… » — la salle sème UNE vue du vivier
 * (scope `talents`), au nom du propriétaire. Sait dire NON : un critère que le contrat refuse, ou une vue vide.
 */
describe('« Mes vues » du vivier — une vue enregistrée en salle', () => {
  it('porte un critère réel, que le contrat de recherche du vivier accepte', () => {
    expect(Object.keys(DEMO_TALENT_SAVED_VIEW.filters).length).toBeGreaterThan(0)
    expect(
      talentSearchQuerySchema.omit({ page: true, limit: true }).partial().safeParse(DEMO_TALENT_SAVED_VIEW.filters)
        .success,
    ).toBe(true)
  })

  it('est écrite par le semis de la salle, scope `talents`, au nom du propriétaire, non partagée', async () => {
    const query = jest.fn(async () => [])
    const service = Object.create(DemoSeedService.prototype) as {
      accounts: { manager: { query: typeof query } }
      seedTalentSavedView: (workspaceId: string, ownerUserId: string) => Promise<void>
    }
    service.accounts = { manager: { query } }
    await service.seedTalentSavedView('ws-1', 'owner-1')
    const [sql, params] = query.mock.calls[0] as unknown as [string, unknown[]]
    expect(sql).toContain('INSERT INTO saved_views')
    expect(sql).toContain("'talents'")
    expect(params).toEqual([
      'ws-1',
      'owner-1',
      DEMO_TALENT_SAVED_VIEW.name,
      JSON.stringify(DEMO_TALENT_SAVED_VIEW.filters),
    ])
  })
})
