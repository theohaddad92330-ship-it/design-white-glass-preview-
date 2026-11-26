import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi } from 'vitest'
import type { UserCredits } from '@/features/credits/api'
import { billingSearchSchema } from '../model/billing-search'
import { Billing } from './Billing'

const creditsState = vi.hoisted(() => ({
  value: {
    data: undefined as UserCredits | undefined,
    isLoading: true,
  },
}))

const redirects = vi.hoisted(() => ({
  checkout: vi.fn(),
  portal: vi.fn(),
  addCard: vi.fn(),
}))

vi.mock('@/features/credits/hooks/useCredits', () => ({
  useCredits: () => creditsState.value,
}))

// L'absence de licence a sa propre suite (`NoLicenseBanner.test.tsx`). Ici elle
// est muette : ce fichier n'a pas de `QueryClientProvider`, et son sujet est la
// composition de l'écran, pas la mutation.

vi.mock('@/features/credits/hooks/useInvoices', () => ({
  useInvoices: () => ({ data: { invoices: [] }, isLoading: false }),
}))

// Live plan catalog — undefined here, so the cards fall back to the shipped
// baseline prices, which is what these assertions are written against.
vi.mock('@/features/credits/hooks/usePlans', () => ({
  usePlans: () => ({ data: undefined, isLoading: false }),
}))

vi.mock('@/features/credits/hooks/useStripeRedirect', () => ({
  useStripeCheckoutRedirect: () => ({ pending: false, redirect: redirects.checkout }),
  useStripePortalRedirect: () => ({ pending: false, redirect: redirects.portal }),
  useStripeAddPaymentMethodRedirect: () => ({ pending: false, redirect: redirects.addCard }),
}))

const teamCredits: UserCredits = {
  user_id: 'user-1',
  plan: 'team',
  accounts_limit: 30,
  accounts_used: 12,
  enrichment_credits: 50,
  stripe_customer_id: 'cus_123',
  stripe_subscription_id: 'sub_123',
}

const freeCredits: UserCredits = {
  user_id: 'user-1',
  plan: 'trial',
  accounts_limit: 40,
  accounts_used: 1,
  enrichment_credits: 75,
  stripe_customer_id: null,
  stripe_subscription_id: null,
}

// A workspace MEMBER: the plan is the owner's, shared and read-only for them.
const memberCredits: UserCredits = {
  user_id: 'owner-1',
  plan: 'team',
  accounts_limit: 30,
  accounts_used: 12,
  enrichment_credits: 50,
  stripe_customer_id: 'cus_123',
  stripe_subscription_id: 'sub_123',
  is_billing_owner: false,
  seats_total: 5,
  seats_used: 3,
}

describe('Billing', () => {
  beforeEach(() => {
    creditsState.value = { data: undefined, isLoading: true }
    redirects.checkout.mockReset()
    redirects.portal.mockReset()
  })

  it('renders the loading skeleton', () => {
    const { container } = render(<Billing />)
    expect(container.querySelector('.animate-pulse')).toBeInTheDocument()
  })

  it('renders the billing dashboard for a subscriber — deux onglets, chacun n’affiche que son contenu', async () => {
    creditsState.value = { isLoading: false, data: teamCredits }

    render(<Billing />)

    expect(screen.getAllByRole('tab').map(tab => tab.textContent)).toEqual(['Abonnement', 'Factures & paiement'])
    expect(screen.getByText('Ton abonnement')).toBeInTheDocument()
    expect(screen.queryByText('Moyen de paiement')).not.toBeInTheDocument()
    await userEvent.setup().click(screen.getByRole('tab', { name: 'Factures & paiement' }))
    expect(screen.getByText('Moyen de paiement')).toBeInTheDocument()
    expect(screen.getByText('Historique de facturation')).toBeInTheDocument()
    await userEvent.setup().click(screen.getByRole('tab', { name: 'Abonnement' }))
    // Subscriber → manage button, enabled, routes to the Stripe portal.
    const manage = screen.getByRole('button', { name: 'Gérer mon abonnement' })
    expect(manage).toBeEnabled()
  })

  // #4466 — /billing = forfait + moyen de paiement + factures, RIEN d'autre :
  // la consommation ne se voit que dans le back-office Bellum.
  it("n'affiche aucun solde, aucun historique de crédits, aucune recharge (#4466)", () => {
    creditsState.value = { isLoading: false, data: teamCredits }

    const { container } = render(<Billing />)

    expect(container.textContent ?? '').not.toMatch(/crédit|credit/i)
    expect(screen.queryByText('Consommation mensuelle')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /recharg|acheter/i })).not.toBeInTheDocument()
    expect(container.querySelector('#recharge-credits')).toBeNull()
  })

  it('offers an enabled plan-picker CTA on the free plan', () => {
    creditsState.value = { isLoading: false, data: freeCredits }

    render(<Billing />)

    // No fabricated "manage subscription" for free users — a functional CTA instead.
    const choose = screen.getByRole('button', { name: 'Choisir un plan' })
    expect(choose).toBeEnabled()
    expect(screen.queryByRole('button', { name: 'Gérer mon abonnement' })).not.toBeInTheDocument()
  })

  it('shows the seats allowance for the owner', () => {
    creditsState.value = { isLoading: false, data: teamCredits }

    render(<Billing />)

    // teamCredits has no seats fields → falls back to the team catalog
    // (3 included seats), 1 used by default.
    expect(screen.getByText('1 / 3')).toBeInTheDocument()
  })

  it('renders billing read-only for a workspace member (non-owner)', () => {
    creditsState.value = { isLoading: false, data: memberCredits }

    render(<Billing />)

    // Members get the shared-plan notice, not the billing controls.
    expect(screen.getAllByText(/géré par le propriétaire de l'espace de travail/i).length).toBeGreaterThan(0)
    expect(screen.queryByRole('button', { name: 'Gérer mon abonnement' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Acheter des crédits' })).not.toBeInTheDocument()
    // Still shows the plan + seats.
    expect(screen.getByText('3 / 5')).toBeInTheDocument()
  })

  // #4531.1 — deux onglets : le calculateur de rentabilité est retiré (revient sur 8b978267b8, 28/08).
  it('#4531.1 — deux onglets, aucun « Rentabilité », le premier est l’abonnement', () => {
    creditsState.value = { isLoading: false, data: teamCredits }
    render(<Billing />)
    expect(screen.getAllByRole('tab').map(tab => tab.textContent)).toEqual(['Abonnement', 'Factures & paiement'])
    expect(screen.queryByRole('tab', { name: /Rentabilité/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('tab', { name: 'Crédits' })).not.toBeInTheDocument()
    expect(screen.getByText('Ton abonnement')).toBeInTheDocument()
  })

  // #4531.4 — l'onglet ne vit pas dans l'URL : un ancien `?tab=rentabilite` est ignoré par le schéma et l'écran
  // retombe sur Abonnement, sans page vide.
  it('#4531.4 — un ancien lien ?tab=rentabilite retombe sur Abonnement', () => {
    expect(billingSearchSchema.parse({ tab: 'rentabilite' })).toEqual({})
    creditsState.value = { isLoading: false, data: teamCredits }
    render(<Billing />)
    expect(screen.getByRole('tab', { name: 'Abonnement' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByText('Ton abonnement')).toBeInTheDocument()
  })
})
