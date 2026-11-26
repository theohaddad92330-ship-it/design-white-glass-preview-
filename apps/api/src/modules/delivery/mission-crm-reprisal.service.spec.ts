import { MissionCrmReprisalService } from './mission-crm-reprisal.service'

const WORKSPACE = 'w0000000-0000-4000-8000-000000000001'

function dealRow(over: Record<string, unknown> = {}) {
  return {
    id: 'f0000000-0000-4000-8000-000000000001',
    workspace_id: WORKSPACE,
    provider: 'hubspot',
    deal_id: '55501',
    name: 'Renouvellement Q4',
    stage: 'negotiation',
    stage_label: 'Négociation',
    amount: '24000',
    is_closed: false,
    is_won: null,
    ...over,
  }
}

function makeService(overrides: { missionCount?: number; dealRows?: Record<string, unknown>[] } = {}) {
  const missions = { count: jest.fn(async () => overrides.missionCount ?? 0) }
  const facts = { find: jest.fn(async () => overrides.dealRows ?? []) }
  const service = new MissionCrmReprisalService(missions as never, facts as never)
  return { service, missions, facts }
}

/**
 * #2562 — la PROPOSITION de reprise, jamais un import silencieux.
 *
 * Disponible seulement quand DEUX conditions tiennent À LA FOIS : l'espace n'a
 * ENCORE aucune mission, et un CRM a laissé des deals dans le cache
 * (`crm_deal_facts`). La seconde condition, lue seule, dirait « un CRM est
 * connecté » — faux : `crm_deal_facts` est un CACHE, pas l'état de connexion
 * (voir `demo-coverage.ts`), et un cache qui survit à une déconnexion ne doit
 * pas re-proposer une reprise à un espace qui a déjà ses missions.
 */
describe('MissionCrmReprisalService.candidates', () => {
  it('aucune mission ET un cache de deals vide : pas de proposition', async () => {
    const { service, facts } = makeService({ missionCount: 0, dealRows: [] })
    const result = await service.candidates(WORKSPACE)
    expect(result).toEqual({ available: false, provider: null, deals: [] })
    expect(facts.find).toHaveBeenCalled()
  })

  it('des missions existent déjà : pas de proposition, et AUCUNE lecture du cache CRM', async () => {
    const { service, facts } = makeService({ missionCount: 3, dealRows: [dealRow()] })
    const result = await service.candidates(WORKSPACE)
    expect(result).toEqual({ available: false, provider: null, deals: [] })
    // ⚠️ Un espace déjà peuplé n'a aucune raison de voir sa fiche CRM relue :
    // la réponse est tranchée par le COMPTE de missions, avant toute requête
    // sur `crm_deal_facts`.
    expect(facts.find).not.toHaveBeenCalled()
  })

  it('aucune mission, des deals en cache : la proposition NOMME le fournisseur, champ par champ', async () => {
    const { service } = makeService({
      missionCount: 0,
      dealRows: [dealRow(), dealRow({ deal_id: '55502', name: 'Nouvelle mission SI', amount: null })],
    })
    const result = await service.candidates(WORKSPACE)
    expect(result.available).toBe(true)
    expect(result.provider).toBe('hubspot')
    expect(result.deals).toEqual([
      {
        dealId: '55501',
        name: 'Renouvellement Q4',
        stage: 'negotiation',
        stageLabel: 'Négociation',
        amount: '24000',
        isClosed: false,
        isWon: null,
      },
      {
        dealId: '55502',
        name: 'Nouvelle mission SI',
        stage: 'negotiation',
        stageLabel: 'Négociation',
        amount: null,
        isClosed: false,
        isWon: null,
      },
    ])
  })

  it('un deal explicitement PERDU (clos, non gagné) n’est jamais proposé', async () => {
    const { service } = makeService({
      missionCount: 0,
      dealRows: [
        dealRow({ is_closed: true, is_won: false }),
        dealRow({ deal_id: '55503', is_closed: true, is_won: true }),
      ],
    })
    const result = await service.candidates(WORKSPACE)
    expect(result.deals.map(d => d.dealId)).toEqual(['55503'])
  })

  it('des deals venus de PLUSIEURS fournisseurs : ambigu, aucune proposition — jamais deviner lequel', async () => {
    const { service } = makeService({
      missionCount: 0,
      dealRows: [dealRow({ provider: 'hubspot' }), dealRow({ deal_id: '2', provider: 'pipedrive' })],
    })
    const result = await service.candidates(WORKSPACE)
    expect(result).toEqual({ available: false, provider: null, deals: [] })
  })

  it('que des deals perdus : le cache existe mais rien à proposer', async () => {
    const { service } = makeService({
      missionCount: 0,
      dealRows: [dealRow({ is_closed: true, is_won: false })],
    })
    const result = await service.candidates(WORKSPACE)
    expect(result).toEqual({ available: false, provider: null, deals: [] })
  })
})
