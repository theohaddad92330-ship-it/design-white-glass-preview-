import { createMockRepository } from '../../database/test-utils'
import { ProfileEntity } from '../../database/entities/profile.entity'
import { ManagerKpiService } from './manager-kpi.service'

const NOW = new Date('2026-08-30T12:00:00.000Z')

/** Route each markered SQL query to its seeded result rows — même patron que
 *  `analytics-overview.service.spec.ts`. */
function seededQuery(sql: string): unknown[] {
  if (sql.includes('q:cohort_members')) {
    return Array.from({ length: 12 }, (_, i) => ({
      user_id: `u${i}`,
      signup_at: new Date(NOW.getTime() - 31 * 86_400_000).toISOString(),
      last_action_at: i < 5 ? new Date(NOW.getTime() - 2 * 86_400_000).toISOString() : null,
    }))
  }
  if (sql.includes('q:validated_actions')) {
    return [
      { state: 'approved', decided_at: new Date(NOW.getTime() - 10 * 86_400_000).toISOString() },
      { state: 'approved', decided_at: new Date(NOW.getTime() - 11 * 86_400_000).toISOString() },
    ]
  }
  if (sql.includes('q:consultants_by_rep')) {
    return [
      { user_id: 'rep-a', created_at: new Date(NOW.getTime() - 5 * 86_400_000).toISOString() },
      { user_id: 'rep-a', created_at: new Date(NOW.getTime() - 6 * 86_400_000).toISOString() },
      { user_id: 'rep-b', created_at: new Date(NOW.getTime() - 3 * 86_400_000).toISOString() },
    ]
  }
  return []
}

/** Les doubles portent un type NOMMÉ : `unknown` faisait remonter `{}` à
 *  l'appelant, et `expect(overview.getOverview)` ne compilait pas — que `jest`
 *  transpile sans vérifier les types ne le rendait visible qu'en CI. */
type OverviewDouble = { getOverview: jest.Mock }
type ProviderCostsDouble = { overview: jest.Mock }

function makeService(overrides?: { overview?: OverviewDouble; providerCosts?: ProviderCostsDouble }) {
  const repo = createMockRepository<ProfileEntity>()
  repo.manager.query.mockImplementation((sql: string) => Promise.resolve(seededQuery(sql)))
  const overview: OverviewDouble = overrides?.overview ?? {
    getOverview: jest.fn().mockResolvedValue({
      revenue: { estimatedMrrEur: 1990, paidAccounts: 10 },
    }),
  }
  const providerCosts: ProviderCostsDouble = overrides?.providerCosts ?? {
    overview: jest.fn().mockResolvedValue({ total: { cost_usd: 300, untariffed: 0 } }),
  }
  const service = new ManagerKpiService(repo as never, overview as never, providerCosts as never)
  return { service, repo, overview, providerCosts }
}

describe('ManagerKpiService', () => {
  it('1 · cohorte des actifs à J+30 — lit profiles + user_actions et applique la formule', async () => {
    const { service } = makeService()
    const measure = await service.activeCohortAtDay30(NOW)
    expect(measure.measurability.measurable).toBe(true)
    expect(measure.measurability.observed).toBe(12)
    expect(measure.value).toBeCloseTo(5 / 12)
  })

  it('#1946.14 · usage à J+7 — lit la fenêtre des inscrits d’il y a 7 à 13 jours, et RIEN d’autre', async () => {
    const repo = createMockRepository<ProfileEntity>()
    const bornes: unknown[][] = []
    repo.manager.query.mockImplementation((_sql: string, params: unknown[]) => {
      bornes.push(params)
      return Promise.resolve(
        Array.from({ length: 10 }, (_, i) => ({
          user_id: `u${i}`,
          signup_at: new Date(NOW.getTime() - 10 * 86_400_000).toISOString(),
          // 4 ont agi il y a deux jours ; les 6 autres n'ont agi QUE le jour de
          // leur inscription — ils ne comptent donc pas comme un usage à J+7.
          last_action_at: new Date(NOW.getTime() - (i < 4 ? 2 : 10) * 86_400_000).toISOString(),
        })),
      )
    })
    const service = new ManagerKpiService(
      repo as never,
      { getOverview: jest.fn() } as never,
      { overview: jest.fn() } as never,
    )

    const measure = await service.activeCohortAtDay7(NOW)

    const [debut, fin] = bornes[0] as [Date, Date]
    expect(fin.getTime()).toBe(NOW.getTime() - 7 * 86_400_000)
    expect(debut.getTime()).toBe(NOW.getTime() - 14 * 86_400_000)
    expect(measure.measurability.observed).toBe(10)
    expect(measure.value).toBeCloseTo(0.4)
  })

  it('2 · rétention à 3 mois — rend « non mesuré » quand la requête ne trouve personne', async () => {
    const repo = createMockRepository<ProfileEntity>()
    repo.manager.query.mockResolvedValue([])
    const service = new ManagerKpiService(
      repo as never,
      { getOverview: jest.fn() } as never,
      { overview: jest.fn() } as never,
    )
    const measure = await service.retentionAtThreeMonths(NOW)
    expect(measure.value).toBeNull()
    expect(measure.measurability.measurable).toBe(false)
  })

  it('3 · marge brute de BELLUM — refuse de mélanger EUR (revenu) et USD (coût)', async () => {
    const { service, overview, providerCosts } = makeService()
    const result = await service.bellumGrossMargin(30)
    expect(overview.getOverview).toHaveBeenCalledWith(30)
    expect(providerCosts.overview).toHaveBeenCalledWith(30)
    expect(result.blockedReason).toBe('currency_mismatch')
    expect(result.marginRate).toBeNull()
  })

  it('3 · marge brute de BELLUM — porte toujours les coûts fixes exclus et le statut plancher', async () => {
    const { service } = makeService({
      providerCosts: { overview: jest.fn().mockResolvedValue({ total: { cost_usd: 100, untariffed: 4 } }) },
    })
    const result = await service.bellumGrossMargin(30)
    expect(result.isFloor).toBe(true)
    expect(result.fixedCostsExcluded.length).toBeGreaterThan(0)
  })

  it('4 · cadence d’actions validées par semaine — bucket les lignes lues en semaines complètes', async () => {
    const { service } = makeService()
    const weeks = await service.validatedActionCadence(4, NOW)
    expect(weeks).toHaveLength(4)
    expect(weeks.reduce((sum, w) => sum + w.validated, 0)).toBe(2)
  })

  it('4 · cadence — rend des semaines à zéro (un vrai zéro), jamais une erreur, quand rien n’est lu', async () => {
    const repo = createMockRepository<ProfileEntity>()
    repo.manager.query.mockResolvedValue([])
    const service = new ManagerKpiService(
      repo as never,
      { getOverview: jest.fn() } as never,
      { overview: jest.fn() } as never,
    )
    const weeks = await service.validatedActionCadence(3, NOW)
    expect(weeks.every(w => w.validated === 0)).toBe(true)
  })

  it('5 · consultants enregistrés par commercial — groupe par `user_id`', async () => {
    const { service } = makeService()
    const result = await service.consultantsRegisteredByRep(30, NOW)
    expect(result).toEqual([
      { userId: 'rep-a', registered: 2 },
      { userId: 'rep-b', registered: 1 },
    ])
  })
})
