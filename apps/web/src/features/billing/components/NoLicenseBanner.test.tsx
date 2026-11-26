import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { i18n } from '@/i18n'
import { useCredits } from '@/features/credits/hooks/useCredits'
import { NoLicenseBanner } from './NoLicenseBanner'

vi.mock('@/features/credits/hooks/useCredits', () => ({ useCredits: vi.fn() }))

function setCredits(data: Record<string, unknown> | undefined) {
  vi.mocked(useCredits).mockReturnValue({ data } as unknown as ReturnType<typeof useCredits>)
}

describe('NoLicenseBanner — il n’y a plus d’essai, il y a la démo et les licences', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('fr')
  })

  it('annonce l’absence de licence sur un compte neuf, et renvoie vers les offres', async () => {
    setCredits({ plan: 'decouverte', is_billing_owner: true })
    const onChoosePlan = vi.fn()
    render(<NoLicenseBanner onChoosePlan={onChoosePlan} />)

    expect(screen.getByText('Aucune licence active')).toBeInTheDocument()
    screen.getByRole('button', { name: 'Voir les offres' }).click()
    expect(onChoosePlan).toHaveBeenCalledTimes(1)
  })

  it('dit la même chose sur `trial` — l’état verrouillé porte encore ce code de palier', () => {
    setCredits({ plan: 'trial', trial_end: new Date(Date.now() + 3 * 86_400_000).toISOString() })
    render(<NoLicenseBanner onChoosePlan={vi.fn()} />)

    // Même avec une date de fin dans le FUTUR : le quota est à zéro, et
    // afficher « il te reste 3 jours » promettrait un accès que le serveur
    // refuse déjà.
    expect(screen.getByText('Aucune licence active')).toBeInTheDocument()
    expect(screen.queryByText(/jour/i)).not.toBeInTheDocument()
  })

  it('ne propose JAMAIS d’activer quoi que ce soit — ce chemin n’existe plus', () => {
    setCredits({ plan: 'decouverte', is_billing_owner: true })
    render(<NoLicenseBanner onChoosePlan={vi.fn()} />)

    expect(screen.queryByRole('button', { name: /activer/i })).not.toBeInTheDocument()
  })

  it('se tait sur un abonnement vivant', () => {
    setCredits({ plan: 'growth' })
    const { container } = render(<NoLicenseBanner onChoosePlan={vi.fn()} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('se tait dans une salle de démonstration — elle ne facture rien', () => {
    setCredits({ plan: 'trial', is_demo: true })
    const { container } = render(<NoLicenseBanner onChoosePlan={vi.fn()} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('se tait tant que le solde n’est pas connu — pas de mur pendant le chargement', () => {
    setCredits(undefined)
    const { container } = render(<NoLicenseBanner onChoosePlan={vi.fn()} />)
    expect(container).toBeEmptyDOMElement()
  })
})
