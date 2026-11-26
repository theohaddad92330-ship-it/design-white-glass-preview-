import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useCredits } from '@/features/credits/hooks/useCredits'
import { CheckoutReturnBanner } from './CheckoutReturnBanner'

vi.mock('@/features/credits/hooks/useCredits', () => ({ useCredits: vi.fn() }))

const invalidateQueries = vi.fn()
vi.mock('@tanstack/react-query', () => ({ useQueryClient: () => ({ invalidateQueries }) }))

/** Pose la chaîne de requête que le fournisseur de paiement a laissée dans l'URL. */
function arriveWith(search: string) {
  window.history.replaceState({}, '', `/billing${search}`)
}

function mockCredits(data: Record<string, unknown> | undefined) {
  vi.mocked(useCredits).mockReturnValue({ data } as unknown as ReturnType<typeof useCredits>)
}

/** Le compte NEUF tel que le signup le pose : palier `decouverte`, zéro crédit.
 *  C'est l'état pendant la course avec le webhook. */
const FRESH = { plan: 'decouverte', accounts_limit: 0, accounts_used: 0, credits_limit: 0, credits_remaining: 0 }
const SERVED = { plan: 'growth', accounts_limit: 250, accounts_used: 0, credits_limit: 250, credits_remaining: 250 }

describe('CheckoutReturnBanner — ce que le client lit en revenant de la caisse (#2003.23, #2004.16)', () => {
  beforeEach(() => {
    invalidateQueries.mockClear()
    arriveWith('')
  })

  it("ne rend RIEN quand aucun retour n'est dans l'URL — zéro impact de mise en page", () => {
    mockCredits(SERVED)
    const { container } = render(<CheckoutReturnBanner />)
    expect(container).toBeEmptyDOMElement()
  })

  it("ne prend PAS l'intention « ouvre la recharge » pour un retour de paiement", () => {
    arriveWith('?topup=true')
    mockCredits(SERVED)
    const { container } = render(<CheckoutReturnBanner />)
    expect(container).toBeEmptyDOMElement()
  })

  it("annonce le paiement reçu et NOMME ce qui a changé quand l'offre est lue", () => {
    arriveWith('?success=true')
    mockCredits(SERVED)
    render(<CheckoutReturnBanner />)
    const banner = screen.getByTestId('checkout-return-banner')
    expect(banner).toHaveAttribute('data-outcome', 'subscription_paid')
    expect(banner).toHaveAttribute('data-activation', 'confirmed')
    expect(banner).toHaveTextContent(/active/i)
    expect(banner).not.toHaveTextContent(/crédit|credit/i)
  })

  /**
   * #2004.16 — la course avec le webhook. Le compte porte encore zéro crédit, et
   * ce zéro est RÉEL : il décrit l'avant-paiement. L'afficher sous « paiement
   * reçu » ferait lire « tu viens de payer, tu as 0 crédit ».
   */
  it("dit « activation en cours » sans jamais écrire le zéro d'avant", () => {
    arriveWith('?success=true')
    mockCredits(FRESH)
    render(<CheckoutReturnBanner />)
    const banner = screen.getByTestId('checkout-return-banner')
    expect(banner).toHaveAttribute('data-activation', 'pending')
    expect(banner).not.toHaveTextContent('0 crédit')
    // Il peut relire lui-même plutôt que d'attendre sans savoir quoi faire.
    expect(screen.getByRole('button', { name: /revérifier/i })).toBeInTheDocument()
  })

  it('relit le solde de lui-même sur un retour payé — et jamais sur un abandon', () => {
    arriveWith('?success=true')
    mockCredits(FRESH)
    render(<CheckoutReturnBanner />)
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ['credits'] })

    invalidateQueries.mockClear()
    arriveWith('?canceled=true')
    mockCredits(FRESH)
    render(<CheckoutReturnBanner />)
    expect(invalidateQueries).not.toHaveBeenCalled()
  })

  it("annonce l'abandon SANS ton d'échec, et dit que rien n'a été débité", () => {
    arriveWith('?canceled=true')
    mockCredits(FRESH)
    render(<CheckoutReturnBanner />)
    const banner = screen.getByTestId('checkout-return-banner')
    expect(banner).toHaveAttribute('data-outcome', 'subscription_abandoned')
    expect(banner).toHaveAttribute('data-activation', 'none')
    expect(banner.textContent ?? '').toMatch(/débité/i)
    // Aucune invite à relire : il n'y a rien de nouveau à lire.
    expect(screen.queryByRole('button', { name: /revérifier/i })).not.toBeInTheDocument()
  })

  it("n'annonce pas un paiement quand une carte a seulement été enregistrée", () => {
    arriveWith('?setup=success')
    mockCredits(SERVED)
    render(<CheckoutReturnBanner />)
    const banner = screen.getByTestId('checkout-return-banner')
    expect(banner).toHaveAttribute('data-outcome', 'card_saved')
    expect(banner.textContent ?? '').toMatch(/prélevé/i)
    expect(invalidateQueries).not.toHaveBeenCalled()
  })

  it('se masque, et une fois masqué ne revient pas', () => {
    arriveWith('?success=true')
    mockCredits(SERVED)
    render(<CheckoutReturnBanner />)
    fireEvent.click(screen.getByRole('button', { name: /masquer/i }))
    expect(screen.queryByTestId('checkout-return-banner')).not.toBeInTheDocument()
  })

  /**
   * L'annonce ne dépend d'AUCUN écran : c'est ce qui la fait survivre au renvoi
   * de `SettingsPage` vers l'onboarding, qui frappe exactement le public
   * concerné — quelqu'un qui vient de s'inscrire et de payer.
   */
  it("lit le retour même quand l'URL n'est pas celle de la facturation", () => {
    window.history.replaceState({}, '', '/onboarding/company?success=true')
    mockCredits(SERVED)
    render(<CheckoutReturnBanner />)
    expect(screen.getByTestId('checkout-return-banner')).toHaveAttribute('data-outcome', 'subscription_paid')
  })

  it("n'invente aucun chiffre quand le solde n'a pas répondu", () => {
    arriveWith('?success=true')
    mockCredits(undefined)
    render(<CheckoutReturnBanner />)
    expect(screen.getByTestId('checkout-return-banner')).toHaveAttribute('data-activation', 'pending')
  })
})
