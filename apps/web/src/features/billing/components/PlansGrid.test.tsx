import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import frOnboarding from '@/i18n/locales/fr/onboarding.json'
import { PlansGrid } from './PlansGrid'

// Le catalogue live n'est pas le sujet ici : on rend la grille embarquée, celle
// que l'écran affiche quand le serveur n'a rien à corriger.
vi.mock('@/features/credits/hooks/usePlans', () => ({
  usePlans: () => ({ data: undefined, isError: false }),
}))

// La devise vient du serveur. Ici on rend l'euro : le sujet de ce fichier est
// l'annualisation, pas la devise — mais sans ce mock la grille tirerait une
// requête et le test tomberait sur l'absence de QueryClient, ce qui ne dirait
// rien sur les prix.
vi.mock('@/features/credits/hooks/useCheckout', () => ({
  useBillingCurrency: () => ({ data: { currency: 'eur', locked: false, supported: ['eur'] } }),
}))

function renderGrid() {
  return render(<PlansGrid currentPlanId="decouverte" loadingPlanId={null} onSelect={vi.fn()} />)
}

describe('facturation annuelle — ce que l’acheteur doit lire (§11)', () => {
  it('affiche l’économie EN EUROS, pas seulement le pourcentage', async () => {
    // « -20 % » est un pourcentage ; ce qui décide un acheteur, c'est le montant
    // qu'il garde. Le lui faire calculer de tête à partir de deux nombres
    // affichés ailleurs est un travail qu'on n'a pas à lui laisser.
    renderGrid()
    await userEvent.click(screen.getByRole('switch'))

    // Team : 259 €/mois → 207 € annualisé → 2 484 €/an, soit 624 € gardés.
    expect(await screen.findByText(/624/)).toBeInTheDocument()
    // Starter : 119 → 95 → 1 140 €/an, soit 288 € gardés.
    expect(screen.getByText(/288/)).toBeInTheDocument()
  })

  it('ne montre l’économie qu’en annuel — en mensuel il n’y en a pas', () => {
    renderGrid()
    expect(screen.queryByText(/624/)).not.toBeInTheDocument()
  })
})

describe('l’engagement annoncé correspond aux CGV (§11)', () => {
  it('annonce l’engagement de 30 jours plutôt que « sans engagement »', () => {
    // La mention « sans engagement » était fausse depuis l'arbitrage du 02/08 :
    // un engagement initial de 30 jours existe, et l'écrire est la seule
    // formulation que les CGV peuvent soutenir. Une promesse commerciale plus
    // généreuse que le contrat se découvre au premier litige.
    const hint = frOnboarding.plan.billingHint
    expect(hint).toMatch(/30 jours/)
    expect(hint).not.toMatch(/sans engagement/i)
  })
})
