import { DEFAULT_BRAND_NAME, DEFAULT_COPILOT_NAME, resolveBrand, type Brand } from '@bellum/contracts'
import { render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { applyBrandToI18n } from '@/i18n'
import { BrandContext } from '@/features/brand/brand-context'
import { OnboardingHelpCard } from './OnboardingHelpCard'

/**
 * #1960.20 — la carte « Besoin d'aide ? » de l'onboarding promet « notre équipe »
 * et ouvre NOTRE boîte de support. Dans un espace en marque blanche, elle ne
 * s'affiche pas : le signalement (bouton flottant, toujours monté) reste le seul
 * recours, conformément à la décision de Louis du 13/09/2026.
 */
function renderIn(brand: Brand) {
  return render(
    <BrandContext.Provider value={brand}>
      <OnboardingHelpCard />
    </BrandContext.Provider>,
  )
}

describe('OnboardingHelpCard', () => {
  afterEach(() => {
    sessionStorage.clear()
    window.history.pushState({}, '', '/')
    applyBrandToI18n({ name: DEFAULT_BRAND_NAME, copilotName: DEFAULT_COPILOT_NAME })
  })

  it('marque blanche : la carte qui renvoie vers le support Bellum n’est pas rendue', () => {
    const { container } = renderIn(resolveBrand({ copilotName: 'Alice' }))

    expect(screen.queryByText("Besoin d'aide ?")).toBeNull()
    expect(container.textContent).toBe('')
  })

  it('témoin : un espace à la marque du produit garde la carte', () => {
    renderIn(resolveBrand(null))

    expect(screen.getByText("Besoin d'aide ?")).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Contacte-nous' })).toBeInTheDocument()
  })

  /**
   * #2020 — un espace en marque blanche RENOMME son copilote, il ne le
   * RETIRE pas (D82, `brand.ts` §"ce que la marque blanche ne défait pas").
   * Seule la carte de support HUMAIN Bellum (#1960.20 ci-dessus) est gardée
   * par `isCustom` ; le guide de Laura est une préoccupation différente.
   */
  it('marque blanche : le guide du copilote reste, sous son nom renommé — la carte de support Bellum reste absente', () => {
    sessionStorage.clear()
    window.history.pushState({}, '', '/onboarding/acme/company_info/equipe-commerciale')
    applyBrandToI18n({ name: 'Alice ESN', copilotName: 'Alice' })

    renderIn(resolveBrand({ copilotName: 'Alice' }))

    expect(screen.getAllByText(/Alice/).length).toBeGreaterThan(0)
    expect(screen.queryByText(/Laura/)).toBeNull()
    expect(screen.queryByText("Besoin d'aide ?")).toBeNull()
  })
})
