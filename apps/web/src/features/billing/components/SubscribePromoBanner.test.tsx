import { render, screen, fireEvent } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useCredits } from '@/features/credits/hooks/useCredits'
import { SubscribePromoBanner } from './SubscribePromoBanner'

vi.mock('@/features/credits/hooks/useCredits', () => ({ useCredits: vi.fn() }))
const navigate = vi.fn()
vi.mock('@tanstack/react-router', () => ({ useNavigate: () => navigate }))

function mockPlan(plan: string, extra: Record<string, unknown> = {}) {
  vi.mocked(useCredits).mockReturnValue({
    data: { plan, ...extra },
  } as unknown as ReturnType<typeof useCredits>)
}

describe('SubscribePromoBanner', () => {
  beforeEach(() => {
    localStorage.clear()
    navigate.mockClear()
  })

  it('renders nothing for a paid plan', () => {
    mockPlan('growth')
    const { container } = render(<SubscribePromoBanner />)
    expect(container).toBeEmptyDOMElement()
  })

  it('renders nothing on a demo workspace — nothing to sell there', () => {
    mockPlan('decouverte', { is_demo: true, trial_end: new Date(Date.now() + 3 * 86_400_000).toISOString() })
    const { container } = render(<SubscribePromoBanner />)
    expect(container).toBeEmptyDOMElement()
  })

  it('shows the active nudge on the Découverte tier and routes to /billing', () => {
    mockPlan('decouverte', { trial_end: new Date(Date.now() + 3 * 86_400_000).toISOString() })
    render(<SubscribePromoBanner />)
    const banner = screen.getByTestId('subscribe-promo-banner')
    expect(banner).toHaveAttribute('data-state', 'active')
    fireEvent.click(screen.getByRole('button', { name: /offres|plans/i }))
    // `search` porte l'intention : sur /billing, une navigation vers la MÊME
    // route sans paramètre ne faisait rien — le bouton semblait mort. Le
    // paramètre ouvre le sélecteur d'offres, y compris depuis /billing.
    expect(navigate).toHaveBeenCalledWith({ to: '/billing', search: { offers: true } })
  })

  it('can be dismissed while active, and stays hidden on re-render', () => {
    mockPlan('trial', { trial_end: new Date(Date.now() + 3 * 86_400_000).toISOString() })
    const { rerender } = render(<SubscribePromoBanner />)
    fireEvent.click(screen.getByRole('button', { name: /masquer|dismiss/i }))
    rerender(<SubscribePromoBanner />)
    expect(screen.queryByTestId('subscribe-promo-banner')).toBeNull()
  })

  it('escalates to a non-dismissible locked state when the trial is expired', () => {
    mockPlan('trial', { trial_expired: true })
    render(<SubscribePromoBanner />)
    const banner = screen.getByTestId('subscribe-promo-banner')
    expect(banner).toHaveAttribute('data-state', 'expired')
    // No dismiss button on a locked state — a block is not hideable.
    expect(screen.queryByRole('button', { name: /masquer|dismiss/i })).toBeNull()
  })

  it('re-shows the expired banner even if the active one was previously dismissed', () => {
    localStorage.setItem('bellum:subscribe-promo-dismissed', 'active')
    mockPlan('trial', { trial_expired: true })
    render(<SubscribePromoBanner />)
    expect(screen.getByTestId('subscribe-promo-banner')).toHaveAttribute('data-state', 'expired')
  })
})

describe('SubscribePromoBanner — espace neuf (#4629)', () => {
  it('ne dit pas « essai terminé » pour un espace qui n’a rien consommé ni payé', () => {
    mockPlan('decouverte', { trial_expired: true, credits_used: 0, stripe_subscription_id: null })
    render(<SubscribePromoBanner />)
    const banner = screen.getByTestId('subscribe-promo-banner')
    expect(banner).toHaveAttribute('data-never-started', 'true')
    expect(banner.textContent).not.toMatch(/essai est terminé|trial has ended/i)
    expect(screen.queryByRole('button', { name: /masquer|dismiss/i })).toBeNull()
  })

  it('garde « essai terminé » pour un espace qui a consommé', () => {
    mockPlan('trial', { trial_expired: true, credits_used: 3, stripe_subscription_id: null })
    render(<SubscribePromoBanner />)
    expect(screen.getByTestId('subscribe-promo-banner')).not.toHaveAttribute('data-never-started')
  })
})

// #4629.2 / #4629.3 — le verrou ÉNUMÈRE ce qui est fermé et ce qui reste ouvert, sans aucun chiffre de crédits ;
// et seul le propriétaire de facturation voit le geste d'abonnement (le membre voit le bandeau, pas le bouton).
describe('SubscribePromoBanner — verrou énuméré et droits (#4629.2, #4629.3)', () => {
  beforeEach(() => {
    localStorage.clear()
    navigate.mockClear()
  })

  it('énumère le fermé (chat, Découvrir) et l’ouvert, sans aucun chiffre', () => {
    mockPlan('trial', { trial_expired: true, credits_used: 3, stripe_subscription_id: null, is_billing_owner: true })
    render(<SubscribePromoBanner />)
    const text = screen.getByTestId('subscribe-promo-banner').textContent ?? ''
    expect(text).toMatch(/le chat avec Laura/)
    expect(text).toMatch(/Découvrir/)
    expect(text).toMatch(/Restent ouverts/)
    // Crédits implicites : le message ne porte AUCUN chiffre.
    expect(text).not.toMatch(/\d/)
  })

  it('le propriétaire de facturation voit « Voir les offres »', () => {
    mockPlan('trial', { trial_expired: true, credits_used: 3, is_billing_owner: true })
    render(<SubscribePromoBanner />)
    expect(screen.getByRole('button', { name: /offres|plans/i })).toBeInTheDocument()
  })

  it('REFUS : un membre non propriétaire ne voit AUCUN bouton d’abonnement, et sait à qui s’adresser', () => {
    mockPlan('trial', { trial_expired: true, credits_used: 3, is_billing_owner: false })
    render(<SubscribePromoBanner />)
    expect(screen.queryByRole('button', { name: /offres|plans/i })).toBeNull()
    const banner = screen.getByTestId('subscribe-promo-banner')
    expect(banner.textContent).toMatch(/propriétaire de l’espace/)
    // Le membre VOIT quand même le verrou énuméré (il est global).
    expect(banner.textContent).toMatch(/le chat avec Laura/)
    expect(navigate).not.toHaveBeenCalled()
  })

  it('REFUS aussi sur la fenêtre active : un membre n’a pas le nudge d’abonnement', () => {
    mockPlan('trial', { trial_end: new Date(Date.now() + 3 * 86_400_000).toISOString(), is_billing_owner: false })
    render(<SubscribePromoBanner />)
    expect(screen.queryByRole('button', { name: /offres|plans/i })).toBeNull()
  })

  it('un membre sur un espace jamais démarré ne voit pas non plus le bouton', () => {
    mockPlan('decouverte', {
      trial_expired: true,
      credits_used: 0,
      stripe_subscription_id: null,
      is_billing_owner: false,
    })
    render(<SubscribePromoBanner />)
    expect(screen.queryByRole('button', { name: /offres|plans/i })).toBeNull()
  })
})
