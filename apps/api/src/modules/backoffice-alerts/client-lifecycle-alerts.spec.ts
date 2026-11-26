import {
  isCancelledStripeSubscription,
  isNewSubscriptionGrant,
  parsePlanFromCheckoutReason,
  type SubscriptionChurnRow,
} from './client-lifecycle-alerts'

describe('isNewSubscriptionGrant — #1676.1 nouveau_client', () => {
  it('un grant né d’un CHECKOUT est un nouvel abonnement', () => {
    expect(isNewSubscriptionGrant('plan:team (checkout evt_123)')).toBe(true)
  })

  it('⚠️ un grant né d’un CHANGEMENT DE PALIER (portail, subscription.updated) n’est PAS un nouveau client', () => {
    expect(isNewSubscriptionGrant('plan:team (subscription.updated sub_123)')).toBe(false)
  })

  it('un top-up n’est jamais un nouveau client (préfixe différent)', () => {
    expect(isNewSubscriptionGrant('topup:credits10 (checkout evt_123)')).toBe(false)
  })

  it('une raison absente ne rend rien', () => {
    expect(isNewSubscriptionGrant(null)).toBe(false)
  })
})

describe('parsePlanFromCheckoutReason', () => {
  it('extrait le palier d’une raison de checkout', () => {
    expect(parsePlanFromCheckoutReason('plan:team (checkout evt_123)')).toBe('team')
  })

  it('rend null pour une forme inconnue', () => {
    expect(parsePlanFromCheckoutReason('plan:team (subscription.updated sub_1)')).toBeNull()
    expect(parsePlanFromCheckoutReason(null)).toBeNull()
  })
})

describe('isCancelledStripeSubscription — #1676.1 churn_client (branche Stripe)', () => {
  const cancelled: SubscriptionChurnRow = {
    billing_mode: 'stripe',
    plan: 'trial',
    accounts_limit: 0,
    enrichment_credits: 0,
    extra_seats: 0,
    topup_analyses: 0,
    stripe_subscription_id: 'sub_123',
  }

  it('la signature exacte d’une résiliation Stripe est reconnue', () => {
    expect(isCancelledStripeSubscription(cancelled)).toBe(true)
  })

  it('⚠️ n’attrape PAS un compte tout neuf (plan `decouverte`, mêmes zéros depuis NoFreeTrial) — la preuve que la garde ne vise pas les nouveaux signups', () => {
    expect(isCancelledStripeSubscription({ ...cancelled, plan: 'decouverte' })).toBe(false)
  })

  it('n’attrape pas un client sur FACTURE (`billing_mode: manual`) — son churn passe par l’autre branche', () => {
    expect(isCancelledStripeSubscription({ ...cancelled, billing_mode: 'manual' })).toBe(false)
  })

  it('n’attrape pas un trial encore actif (quota non ramené à zéro)', () => {
    expect(isCancelledStripeSubscription({ ...cancelled, accounts_limit: 40, enrichment_credits: 75 })).toBe(false)
  })

  it('n’attrape pas une ligne sans abonnement Stripe (jamais souscrit)', () => {
    expect(isCancelledStripeSubscription({ ...cancelled, stripe_subscription_id: null })).toBe(false)
  })
})
