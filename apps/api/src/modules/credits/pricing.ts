import { ANNUAL_DISCOUNT } from '@bellum/contracts'

/**
 * Product name of the extra-seat line item on a subscription. Shared by the
 * checkout (which creates it) and the price-sync (which must NOT touch it — the
 * seat price is a code constant, not an operator-editable catalog field), so the
 * two can never drift apart on the string.
 */
export const SEAT_LINE_NAME = 'Sièges supplémentaires'

/**
 * Marks which Bellum line a Stripe subscription item is, stamped onto the
 * inline `product_data.metadata` at checkout. Lets the price-sync identify the
 * plan line unambiguously instead of matching on a display name.
 *
 * Subscriptions created BEFORE this tag shipped carry no metadata — the sync
 * falls back to name matching for those (see `pickPlanItem`).
 */
export const BELLUM_LINE_METADATA_KEY = 'bellum_line'

/**
 * The amount actually charged per billing cycle for a plan whose catalog price
 * is {@link monthlyPriceCents}.
 *
 * Annual = 12 months at −20 %, rounded to a whole euro so the charge matches the
 * total shown in the UI. THE SINGLE DEFINITION of that math: both the checkout
 * (new subscriptions) and the price-sync (existing subscriptions) call this, so
 * an operator's price edit lands identically on both paths. Duplicating the
 * formula is how the two silently diverge.
 */
export function cycleUnitAmountCents(monthlyPriceCents: number, interval: 'month' | 'year'): number {
  if (interval === 'year') return Math.round((monthlyPriceCents / 100) * ANNUAL_DISCOUNT * 12) * 100
  return monthlyPriceCents
}
