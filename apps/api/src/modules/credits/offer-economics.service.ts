import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { SubscriptionEntity } from '../../database/entities/subscription.entity'
import { creditCapacity } from './credits.service'
import { computeOfferEconomics, type OfferEconomics, type OfferSubscriptionRow } from './offer-economics'
import { PlanCatalogService } from './plan-catalog.service'

/**
 * Ce que chaque offre RAPPORTE, pour le catalogue du back-office (issue 1656).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE SERVICE N'ÉCRIT RIEN, ET NE POURRA JAMAIS ÉCRIRE
 * ─────────────────────────────────────────────────────────────────────────────
 * Il LIT `subscriptions` et le catalogue. Il n'a aucun chemin d'écriture vers
 * un abonnement, un prix, une facture ou un crédit — ce n'est pas une
 * convention, c'est l'absence de code. Le catalogue continue de s'éditer par
 * `PATCH /internal/admin/plans/:key`, avec sa confirmation côté console.
 *
 * ⚠️ LA CAPACITÉ N'EST PAS RECALCULÉE ICI. Elle vient de `creditCapacity`
 * (`credits.service`), la fonction qui décide aussi si une analyse passe. La
 * recopier aurait donné deux définitions de « son plafond », dont l'une aurait
 * fini par oublier le report — la faute déjà payée par `maybeNotifyCreditLow`.
 *
 * ⚠️ AUCUNE COLONNE PERSONNELLE NE TRANSITE. Le `select` ne demande ni
 * `user_id`, ni identifiant Stripe : cet écran agrège des offres, il ne désigne
 * personne. C'est aussi ce qui rend inoffensif le fait qu'il traverse tous les
 * espaces.
 */
@Injectable()
export class OfferEconomicsService {
  constructor(
    @InjectRepository(SubscriptionEntity)
    private readonly subscriptions: Repository<SubscriptionEntity>,
    private readonly catalog: PlanCatalogService,
  ) {}

  /**
   * Le catalogue, enrichi de ce que chaque offre rapporte.
   *
   * `today` est passé au calcul PUR, qui ne lit jamais l'horloge lui-même : il
   * ne sert qu'à savoir si un cycle est refermé, et un test qui lirait
   * `new Date()` passerait à Paris pour échouer en CI (UTC).
   */
  async overview(today: Date = new Date()): Promise<OfferEconomics[]> {
    const [plans, rows] = await Promise.all([
      this.catalog.all(),
      this.subscriptions.find({
        select: {
          plan: true,
          billing_mode: true,
          extra_seats: true,
          accounts_used: true,
          accounts_limit: true,
          topup_analyses: true,
          rollover_credits: true,
          rollover_expires_at: true,
          period_start: true,
        },
      }),
    ])

    const subscriptions: OfferSubscriptionRow[] = rows.map(row => ({
      plan: row.plan,
      billingMode: row.billing_mode === 'manual' ? 'manual' : 'stripe',
      extraSeats: row.extra_seats ?? 0,
      creditsUsed: row.accounts_used ?? 0,
      capacity: creditCapacity(row),
      periodStart: toIso(row.period_start),
    }))

    return computeOfferEconomics({
      catalog: plans.map(plan => ({
        key: plan.key,
        label: plan.label,
        priceCents: plan.price,
        seatPriceCents: plan.extra_seat_price,
        creditsPerCycle: plan.accounts_limit,
        sortOrder: plan.sort_order,
      })),
      subscriptions,
      today,
    })
  }
}

/** Une date de base peut revenir en `Date` ou en chaîne selon le pilote. `null`
 *  pour tout le reste — une date illisible n'est pas une date d'aujourd'hui. */
function toIso(value: Date | string | null | undefined): string | null {
  if (value instanceof Date) return Number.isFinite(value.getTime()) ? value.toISOString() : null
  if (typeof value === 'string') {
    const parsed = Date.parse(value)
    return Number.isFinite(parsed) ? new Date(parsed).toISOString() : null
  }
  return null
}
