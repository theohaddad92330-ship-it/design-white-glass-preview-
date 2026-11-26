import { PlanDefinitionEntity } from '../../database/entities/plan-definition.entity'
import type { SubscriptionEntity } from '../../database/entities/subscription.entity'
import { createMockRepository } from '../../database/test-utils'
import { OfferEconomicsService } from './offer-economics.service'
import { PlanCatalogService } from './plan-catalog.service'

/**
 * Ce que ce spec garde, et que le module pur ne peut pas garder : la TRADUCTION
 * des lignes de base vers la forme du calcul. C'est là qu'un plafond peut
 * silencieusement perdre le report d'un client, ou qu'un prix peut se figer.
 */

const TODAY = new Date('2026-09-15T12:00:00.000Z')

function subscription(over: Partial<SubscriptionEntity> = {}): SubscriptionEntity {
  return {
    plan: 'growth',
    billing_mode: 'stripe',
    extra_seats: 0,
    accounts_used: 10,
    accounts_limit: 250,
    topup_analyses: 0,
    rollover_credits: 0,
    rollover_expires_at: null,
    period_start: new Date('2026-09-01T00:00:00.000Z'),
    ...over,
  } as SubscriptionEntity
}

function makeService(rows: SubscriptionEntity[]) {
  const subscriptions = createMockRepository<SubscriptionEntity>()
  subscriptions.find = jest.fn().mockResolvedValue(rows)
  const catalog = new PlanCatalogService(createMockRepository<PlanDefinitionEntity>() as never)
  return { service: new OfferEconomicsService(subscriptions as never, catalog), subscriptions }
}

describe('OfferEconomicsService', () => {
  it('rend une ligne par offre du catalogue vivant — jamais une grille recopiée', async () => {
    const { service } = makeService([])
    const offers = await service.overview(TODAY)
    // Le catalogue par défaut du dépôt porte au moins starter / team / growth.
    expect(offers.length).toBeGreaterThanOrEqual(3)
    const growth = offers.find(o => o.key === 'growth')
    expect(growth?.priceCents).toBe(19_900)
    // Aucun abonnement : toutes les dérivées à `null`, la règle de l'issue.
    expect(growth?.customers).toBe(0)
    expect(growth?.mrrCents).toBeNull()
    expect(growth?.overrunRate).toBeNull()
  })

  it('compte le report ENCORE VALIDE dans le plafond — la même capacité que celle qui refuse une analyse', async () => {
    const { service } = makeService([
      subscription({
        accounts_limit: 250,
        rollover_credits: 100,
        rollover_expires_at: new Date('2099-01-01T00:00:00.000Z'),
        accounts_used: 300,
      }),
      subscription({ accounts_used: 250 }),
      subscription({ accounts_used: 3 }),
    ])
    const growth = (await service.overview(TODAY)).find(o => o.key === 'growth')
    // 300 < 250 + 100 : ce client n'a PAS atteint son plafond. Un plafond
    // recopié sans le report l'aurait déclaré en dépassement.
    expect(growth?.overrunObserved).toBe(1)
    expect(growth?.overrunEligible).toBe(3)
  })

  it('ignore un report EXPIRÉ — une réserve périmée vaut zéro, pas « bientôt zéro »', async () => {
    const { service } = makeService([
      subscription({
        accounts_limit: 250,
        rollover_credits: 100,
        rollover_expires_at: new Date('2026-08-01T00:00:00.000Z'),
        accounts_used: 250,
      }),
    ])
    const growth = (await service.overview(TODAY)).find(o => o.key === 'growth')
    expect(growth?.overrunObserved).toBe(1)
  })

  it('ajoute la recharge ponctuelle au plafond', async () => {
    const { service } = makeService([subscription({ accounts_limit: 250, topup_analyses: 50, accounts_used: 260 })])
    const growth = (await service.overview(TODAY)).find(o => o.key === 'growth')
    expect(growth?.overrunObserved).toBe(0)
  })

  it('ne lit QUE les colonnes dont le calcul a besoin — aucune donnée personnelle ne transite', async () => {
    const { service, subscriptions } = makeService([])
    await service.overview(TODAY)
    const selected = (subscriptions.find as jest.Mock).mock.calls[0]?.[0]?.select as Record<string, boolean>
    expect(Object.keys(selected).sort()).toEqual(
      [
        'accounts_limit',
        'accounts_used',
        'billing_mode',
        'extra_seats',
        'period_start',
        'plan',
        'rollover_credits',
        'rollover_expires_at',
        'topup_analyses',
      ].sort(),
    )
    expect(selected['user_id']).toBeUndefined()
  })
})
