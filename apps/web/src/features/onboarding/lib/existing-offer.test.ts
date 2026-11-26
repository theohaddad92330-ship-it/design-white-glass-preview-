import { describe, expect, it } from 'vitest'
import type { UserCredits } from '@/features/credits/api'
import type { PlanCatalog } from '@/lib/plans'
import { describeExistingOffer, hasExistingOffer } from './existing-offer'

function credits(overrides: Partial<UserCredits> = {}): UserCredits {
  return {
    user_id: 'u1',
    plan: 'decouverte',
    accounts_limit: 1,
    accounts_used: 0,
    enrichment_credits: 5,
    ...overrides,
  }
}

/** The LIVE catalog as served by `GET /credits/plans` — operator-editable, so a
 *  label/quota here may differ from anything shipped in the front bundle. */
const CATALOG: PlanCatalog = {
  decouverte: {
    label: 'Découverte',
    price: 0,
    accounts_limit: 1,
    enrichment_credits: 5,
    seats: 1,
    extra_seat_price: 2900,
  },
  trial: {
    label: 'Essai complet',
    price: 0,
    accounts_limit: 40,
    enrichment_credits: 75,
    seats: 3,
    extra_seat_price: 2900,
  },
  team: {
    // Deliberately NOT the shipped baseline name: an operator rename must reach
    // the screen, otherwise we would greet the user with a stale plan name.
    label: 'Équipe',
    price: 25900,
    accounts_limit: 50,
    enrichment_credits: 100,
    seats: 3,
    extra_seat_price: 2900,
  },
}

describe('hasExistingOffer', () => {
  it('is false for a brand-new self-serve account (the signup tier, nothing consumed)', () => {
    expect(hasExistingOffer(credits())).toBe(false)
  })

  it('is false when the credits read failed — never block a real newcomer', () => {
    expect(hasExistingOffer(undefined)).toBe(false)
    expect(hasExistingOffer(null)).toBe(false)
  })

  it('is true for any tier other than the signup one (paid, trial, beta)', () => {
    expect(hasExistingOffer(credits({ plan: 'team' }))).toBe(true)
    expect(hasExistingOffer(credits({ plan: 'growth' }))).toBe(true)
    expect(hasExistingOffer(credits({ plan: 'trial' }))).toBe(true)
    expect(hasExistingOffer(credits({ plan: 'beta' }))).toBe(true)
  })

  it('is true when analyses were already consumed, even on the signup tier', () => {
    expect(hasExistingOffer(credits({ accounts_used: 3 }))).toBe(true)
  })
})

describe('describeExistingOffer', () => {
  it('returns nothing for a brand-new account', () => {
    expect(describeExistingOffer(credits(), CATALOG)).toBeNull()
  })

  it('names the tier from the LIVE catalog, not from a shipped constant', () => {
    const offer = describeExistingOffer(credits({ plan: 'team', accounts_limit: 50 }), CATALOG)
    expect(offer?.planLabel).toBe('Équipe')
  })

  it('exposes no quota or balance — no credit is ever shown (#4463)', () => {
    const offer = describeExistingOffer(
      credits({ plan: 'team', accounts_limit: 70, topup_analyses: 20, enrichment_credits: 100 }),
      CATALOG,
    )
    expect(Object.keys(offer ?? {}).sort()).toEqual(['isSeat', 'planId', 'planLabel'])
  })

  it('falls back to the server plan code when the catalog is unavailable — never an invented name', () => {
    const offer = describeExistingOffer(credits({ plan: 'growth', accounts_limit: 120 }), undefined)
    expect(offer?.planLabel).toBe('growth')
  })

  it('flags a seat: the caller does not carry the billing of the workspace', () => {
    const seat = describeExistingOffer(credits({ plan: 'team', is_billing_owner: false }), CATALOG)
    expect(seat?.isSeat).toBe(true)
    const owner = describeExistingOffer(credits({ plan: 'team', is_billing_owner: true }), CATALOG)
    expect(owner?.isSeat).toBe(false)
  })

  it('treats a payload without the seat field as the owner (solo account, legacy payload)', () => {
    expect(describeExistingOffer(credits({ plan: 'team' }), CATALOG)?.isSeat).toBe(false)
  })

  it('keeps the server plan code so the caller can key off it', () => {
    expect(describeExistingOffer(credits({ plan: 'beta' }), CATALOG)?.planId).toBe('beta')
  })
})
