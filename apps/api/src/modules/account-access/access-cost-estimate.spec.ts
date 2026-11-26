import { AccountAccessService } from './account-access.service'

/**
 * #4016.L4 — « coût d'accès estimé » : quand CE compte n'a aucun coût déclaré, l'onglet Accès montre la
 * déclaration la plus récente de l'ESPACE sur un autre de ses comptes au même verrou — badgée « estimé »,
 * nommée, datée. Jamais un coût d'un autre espace (art. 101 TFUE) : la lecture est bornée à l'espace.
 */
const NOW = new Date('2026-10-17T00:00:00.000Z')

function fact(over: Record<string, unknown>) {
  return {
    id: `f-${Math.random()}`,
    workspace_id: 'ws-1',
    entity_id: null,
    detail: null,
    source: 'déclaré',
    provenance: 'human',
    created_at: new Date('2026-09-01T00:00:00.000Z'),
    ...over,
  }
}

function buildService(own: Record<string, unknown>[], elsewhere: Record<string, unknown>[]) {
  const find = jest.fn(async ({ where }: { where: Record<string, unknown> }) =>
    where.account_id === 'acc-1' ? own : elsewhere,
  )
  const facts = { find, query: jest.fn().mockResolvedValue([]), save: jest.fn(), create: jest.fn() }
  const accounts = {
    findOne: jest.fn().mockResolvedValue({
      id: 'acc-1',
      siren: null,
      priority_gate: 'pending',
      raw_analysis: {},
      signals_collected_at: null,
      employees: null,
    }),
    find: jest.fn().mockResolvedValue([{ id: 'acc-2', company_name: 'Thales' }]),
  }
  const entities = { find: jest.fn().mockResolvedValue([]) }
  return { service: new AccountAccessService(facts as never, accounts as never, entities as never), find, accounts }
}

const LOCKED_HERE = fact({ account_id: 'acc-1', kind: 'lock', value: 'verrouille', observed_at: '2026-10-01' })
const LOCKED_THERE = fact({ account_id: 'acc-2', kind: 'lock', value: 'verrouille', observed_at: '2026-09-15' })
const COST_THERE = fact({ account_id: 'acc-2', kind: 'cost', value: '3 % via le porteur', observed_at: '2026-09-15' })

describe('AccountAccessService.landscape — coût d’accès estimé (#4016.L4)', () => {
  it('sans coût déclaré ici : l’estimation vient d’un compte de l’ESPACE au même verrou', async () => {
    const { service, find, accounts } = buildService([LOCKED_HERE], [LOCKED_THERE, COST_THERE])
    const landscape = await service.landscape('ws-1', 'acc-1', NOW)
    expect(landscape.cost).toBeNull()
    expect(landscape.costEstimate).toEqual({
      value: '3 % via le porteur',
      basis: { companyName: 'Thales', observedAt: '2026-09-15', lock: 'verrouille' },
    })
    // Bornée à l'espace — jamais un coût d'un autre espace.
    expect(find.mock.calls.at(-1)?.[0]?.where?.workspace_id).toBe('ws-1')
    expect(accounts.find.mock.calls[0]?.[0]?.where?.workspace_id).toBe('ws-1')
  })

  it('sait dire NON : un coût DÉCLARÉ ici gagne, aucune estimation n’est calculée', async () => {
    const own = [LOCKED_HERE, fact({ account_id: 'acc-1', kind: 'cost', value: '2 %', observed_at: '2026-10-01' })]
    const { service, accounts } = buildService(own, [LOCKED_THERE, COST_THERE])
    const landscape = await service.landscape('ws-1', 'acc-1', NOW)
    expect(landscape.cost?.value).toBe('2 %')
    expect(landscape.costEstimate).toBeNull()
    expect(accounts.find).not.toHaveBeenCalled()
  })

  it('sait dire NON : verrou inconnu ici → aucune base, aucune estimation', async () => {
    const { service } = buildService([], [LOCKED_THERE, COST_THERE])
    const landscape = await service.landscape('ws-1', 'acc-1', NOW)
    expect(landscape.costEstimate).toBeNull()
  })
})
