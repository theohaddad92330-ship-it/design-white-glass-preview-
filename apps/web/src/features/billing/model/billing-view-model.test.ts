import { describe, expect, it } from 'vitest'
import type { StripeInvoice, UserCredits } from '@/features/credits/api'
import { buildBillingViewModel } from './billing-view-model'

function credits(over: Partial<UserCredits>): UserCredits {
  return {
    user_id: 'user-1',
    plan: 'growth',
    accounts_limit: 120,
    accounts_used: 0,
    enrichment_credits: 0,
    stripe_customer_id: null,
    stripe_subscription_id: null,
    ...over,
  }
}

const noInvoices: StripeInvoice[] = []

// #4466 — /billing = forfait + moyen de paiement + factures. Le modèle ne porte
// plus ni solde, ni consommation, ni report : la consommation se lit au back-office.
describe('buildBillingViewModel — aucun solde, aucune consommation (#4466)', () => {
  it('ne porte aucune clé de crédit, de consommation ni de recharge', () => {
    const model = buildBillingViewModel(credits({ accounts_limit: 500, accounts_used: 4 }), noInvoices)

    const keys = Object.keys(model).join(' ')
    expect(keys).not.toMatch(/credit|usage|remaining|rollover|topup|breakdown/i)
    expect(JSON.stringify(model)).not.toMatch(/crédit|credit/i)
  })
})

describe('buildBillingViewModel — trial renewal shows the expiry date (P0-07)', () => {
  it('renders the trial end date as the renewal line', () => {
    const model = buildBillingViewModel(
      credits({ plan: 'trial', accounts_limit: 3, trial_end: '2026-07-28T00:00:00.000Z' }),
      noInvoices,
    )
    expect(model.renewalLabel).toContain('2026')
    expect(model.renewalLabel).not.toBe('Aucun renouvellement actif')
  })

  it('keeps the normal renewal line for a paid plan (no trial end)', () => {
    const model = buildBillingViewModel(
      credits({ plan: 'growth', accounts_limit: 120, stripe_subscription_id: 'sub_1' }),
      noInvoices,
    )
    expect(model.renewalLabel).not.toContain('2026')
  })
})

describe('buildBillingViewModel — the signup tier is named as itself', () => {
  it('labels a Découverte account « Découverte », not the first paid tier', () => {
    // `decouverte` was in neither the public grid nor the beta mirror, so
    // `findPlan` fell through to `plans[0]`: a self-serve signup with ONE
    // analysis read « BellumAI Starter-Solo » on its own billing screen.
    const model = buildBillingViewModel(
      credits({ plan: 'decouverte', accounts_limit: 6, enrichment_credits: 0 }),
      noInvoices,
    )

    expect(model.planLabel).toContain('Découverte')
    expect(model.planLabel).not.toContain('Starter-Solo')
  })

  it('still reads as a windowed tier (trial banner + expiry line)', () => {
    const model = buildBillingViewModel(
      credits({ plan: 'decouverte', accounts_limit: 1, trial_end: '2026-07-28T00:00:00.000Z' }),
      noInvoices,
    )
    expect(model.planStatus).toBe('trial')
    expect(model.renewalLabel).toContain('2026')
  })
})

// #4669.1 — « Sièges 2 / 1 » : plus d'occupés que de payés est une fraction impossible. L'écart se NOMME.
describe('buildBillingViewModel — sièges (#4669.1)', () => {
  it('le rapport tombe juste : « 2 / 5 », aucun écart', () => {
    const model = buildBillingViewModel(credits({ seats_used: 2, seats_total: 5 }), noInvoices)
    expect(model.seatsLabel).toBe('2 / 5')
    expect(model.seatsOverBy).toBe(0)
  })

  it('NON : jamais une fraction impossible — « 2 / 1 » devient un écart nommé de 1 siège', () => {
    const model = buildBillingViewModel(credits({ seats_used: 2, seats_total: 1 }), noInvoices)
    expect(model.seatsLabel).not.toMatch(/2 \/ 1/)
    expect(model.seatsOverBy).toBe(1)
    expect(model.seatsLabel).toMatch(/2/)
  })

  it('plein sans dépasser : « 3 / 3 », pas d’écart', () => {
    const model = buildBillingViewModel(credits({ seats_used: 3, seats_total: 3 }), noInvoices)
    expect(model.seatsLabel).toBe('3 / 3')
    expect(model.seatsOverBy).toBe(0)
  })
})
