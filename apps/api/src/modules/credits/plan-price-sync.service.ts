import { Injectable, Logger, Optional } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { IsNull, Not, Repository } from 'typeorm'
import { SubscriptionEntity } from '../../database/entities/subscription.entity'
import { SingletonLockService, withSingletonLock } from '../locks/singleton-lock.service'
import { StripeService, type SubscriptionLineItem } from '../stripe/stripe.service'
import type { PlanDefinition } from './plan-catalog.defaults'
import { PlanCatalogService } from './plan-catalog.service'
import { BELLUM_LINE_METADATA_KEY, cycleUnitAmountCents, SEAT_LINE_NAME } from './pricing'

/** How many subscriptions are re-priced against the Stripe API at once. */
const SYNC_CONCURRENCY = 5

/** Outcome of one plan-wide re-pricing run — audit-logged and returned to tests.
 *  Local: callers only ever consume it as `syncPlan`'s inferred return type. */
type PlanPriceSyncReport = {
  planKey: string
  /** Subscribers on the plan that carry a Stripe subscription id. */
  considered: number
  /** Subscriptions whose plan line was actually re-priced. */
  updated: number
  /** Already at the target amount, or no identifiable plan line. */
  skipped: number
  failed: number
}

/**
 * Propagates an operator's plan-price edit onto the subscriptions ALREADY
 * running on that plan.
 *
 * Without this, a price change in the backoffice only ever reached NEW
 * checkouts: an existing subscription keeps billing the inline price it was
 * created with, forever.
 *
 * CONTRACT — nobody is charged early. Every Stripe write uses
 * `proration_behavior: 'none'`, so a subscriber finishes the cycle they already
 * paid at the old rate and only meets the new rate at their next renewal. That
 * is what makes propagating automatically on every edit safe: a typo corrected
 * before the customer's renewal date has cost nobody anything.
 *
 * SCOPE — both billable lines follow the catalog: the PLAN line and the
 * extra-SEAT line (whose price is per-plan and operator-editable too). Seat
 * QUANTITY is never touched — how many seats a customer bought is their
 * decision, not a catalog value.
 *
 * NO QUOTA WRITES — a price change alters no cap, so this writes nothing to
 * `subscriptions` and deliberately leaves the Stripe subscription's `metadata`
 * alone (see {@link StripeService.updateSubscriptionItemPrice}).
 */
@Injectable()
export class PlanPriceSyncService {
  private readonly logger = new Logger(PlanPriceSyncService.name)

  constructor(
    @InjectRepository(SubscriptionEntity)
    private readonly subscriptions: Repository<SubscriptionEntity>,
    private readonly planCatalog: PlanCatalogService,
    private readonly stripeService: StripeService,
    // Optional, like every other lock consumer: without Redis the helper runs
    // the body directly (single-replica behaviour).
    @Optional() private readonly locks?: SingletonLockService,
  ) {}

  /**
   * Re-price every live subscription on `planKey` to the catalog's current
   * price. Idempotent: a subscription already at the target amount is skipped,
   * so a re-run (or two edits racing) converges instead of stacking writes.
   *
   * Held under a per-plan singleton lock so two operator edits in quick
   * succession can't interleave and leave subscribers on mixed amounts.
   */
  async syncPlan(planKey: string): Promise<PlanPriceSyncReport> {
    const report: PlanPriceSyncReport = { planKey, considered: 0, updated: 0, skipped: 0, failed: 0 }

    await withSingletonLock(this.locks, `plan-price-sync:${planKey}`, async () => {
      const def = await this.planCatalog.getOrDefault(planKey as Parameters<PlanCatalogService['getOrDefault']>[0])
      const rows = await this.subscriptions.find({
        where: { plan: planKey, stripe_subscription_id: Not(IsNull()) },
      })
      report.considered = rows.length

      for (let i = 0; i < rows.length; i += SYNC_CONCURRENCY) {
        const batch = rows.slice(i, i + SYNC_CONCURRENCY)
        const outcomes = await Promise.all(batch.map(row => this.syncOne(row.stripe_subscription_id as string, def)))
        for (const outcome of outcomes) report[outcome] += 1
      }
    })

    this.logger.log(
      `Plan price sync ${report.planKey}: ${report.updated} updated, ${report.skipped} skipped, ${report.failed} failed (${report.considered} considered)`,
      { tags: { 'billing.op': 'plan_price_sync', 'plan.key': report.planKey } },
    )
    return report
  }

  /**
   * Re-price one subscription's billable lines. Never throws — a single
   * unreachable subscription (deleted in Stripe, API blip) must not abort the
   * rest of the plan's batch.
   */
  private async syncOne(subscriptionId: string, def: PlanDefinition): Promise<'updated' | 'skipped' | 'failed'> {
    try {
      const items = await this.stripeService.listSubscriptionItems(subscriptionId)
      const planItem = pickPlanItem(items)
      if (!planItem) {
        this.logger.warn(`No identifiable plan line on subscription ${subscriptionId} — left untouched`, {
          tags: { 'billing.op': 'plan_price_sync_ambiguous' },
        })
        return 'skipped'
      }

      let wrote = await this.repriceLine(subscriptionId, planItem, 'plan', `BellumAI ${def.label}`, def.price)

      // The seat line only exists when the customer bought extra seats. Its
      // QUANTITY is preserved — only the per-seat price follows the catalog.
      const seatItem = pickSeatItem(items)
      if (seatItem) {
        const seatWrote = await this.repriceLine(subscriptionId, seatItem, 'seat', SEAT_LINE_NAME, def.extra_seat_price)
        wrote = wrote || seatWrote
      }

      return wrote ? 'updated' : 'skipped'
    } catch (error) {
      this.logger.error(`Failed to re-price subscription ${subscriptionId}`, {
        error,
        tags: { 'billing.op': 'plan_price_sync_failed' },
      })
      return 'failed'
    }
  }

  /**
   * Bring ONE line to the catalog's current monthly price. Returns whether a
   * price write actually happened, so an already-correct subscription reports
   * as skipped instead of inflating the "updated" count.
   */
  private async repriceLine(
    subscriptionId: string,
    item: SubscriptionLineItem,
    line: 'plan' | 'seat',
    wantedName: string,
    monthlyPriceCents: number,
  ): Promise<boolean> {
    // Keep the invoice wording in step with the catalog, and backfill the line
    // tag on subscriptions that predate it so the next run is unambiguous. Each
    // checkout mints its own inline product, so this touches one customer.
    const isTagged = item.productMetadata[BELLUM_LINE_METADATA_KEY] === line
    if (item.productName !== wantedName || !isTagged) {
      await this.stripeService.updateProduct(item.productId, {
        name: wantedName,
        metadata: { [BELLUM_LINE_METADATA_KEY]: line },
      })
    }

    // The subscriber's OWN cadence decides the amount: an annual subscriber
    // must get the annual (−20 % × 12) figure, not the monthly one.
    const target = cycleUnitAmountCents(monthlyPriceCents, item.interval)
    if (item.unitAmount === target) return false

    await this.stripeService.updateSubscriptionItemPrice({
      subscriptionId,
      itemId: item.itemId,
      productId: item.productId,
      unitAmount: target,
      interval: item.interval,
      quantity: item.quantity,
      currency: item.currency,
    })

    this.logger.log(
      `Re-priced ${line} line of ${subscriptionId}: ${item.unitAmount} -> ${target} cents (${item.interval})`,
      { tags: { 'billing.op': 'plan_price_sync_item' } },
    )
    return true
  }
}

/**
 * Identify the plan line among a subscription's items.
 *
 * Prefers the `bellum_line` product tag stamped at checkout. Subscriptions
 * created before that tag shipped carry no metadata, so two fallbacks follow:
 * a lone item is the plan, and otherwise the seat line is excluded by name.
 * Anything still ambiguous returns `null` — the caller skips and logs rather
 * than guessing at a customer's bill.
 */
function pickPlanItem(items: SubscriptionLineItem[]): SubscriptionLineItem | undefined {
  const tagged = items.filter(item => item.productMetadata[BELLUM_LINE_METADATA_KEY] === 'plan')
  if (tagged.length === 1) return tagged[0]
  if (tagged.length > 1) return undefined

  if (items.length === 1) return items[0]

  const notSeat = items.filter(
    item => item.productMetadata[BELLUM_LINE_METADATA_KEY] !== 'seat' && item.productName !== SEAT_LINE_NAME,
  )
  return notSeat.length === 1 ? notSeat[0] : undefined
}

/**
 * Identify the extra-seat line, if the subscription has one. Prefers the
 * `bellum_line` tag; falls back to the product name for subscriptions created
 * before the tag shipped. Absent (no extra seats bought) is the normal case.
 */
function pickSeatItem(items: SubscriptionLineItem[]): SubscriptionLineItem | undefined {
  const tagged = items.filter(item => item.productMetadata[BELLUM_LINE_METADATA_KEY] === 'seat')
  if (tagged.length === 1) return tagged[0]
  if (tagged.length > 1) return undefined

  const byName = items.filter(item => item.productName === SEAT_LINE_NAME)
  return byName.length === 1 ? byName[0] : undefined
}
