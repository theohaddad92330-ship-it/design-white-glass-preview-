import { resolveBrand, type Brand } from '@bellum/contracts'
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { BrandContext } from '@/features/brand/brand-context'
import { InvalidLinkMessage } from './invalid-link-message'

vi.mock('@tanstack/react-router', () => ({ useNavigate: () => vi.fn() }))

/**
 * #1960.20 — sur un domaine en marque blanche, l'écran de lien invalide ne
 * renvoie pas vers NOTRE support : le bouton ouvrirait une boîte Bellum chez un
 * client qui a payé pour sa propre marque (décision de Louis du 13/09/2026).
 */
function renderIn(brand: Brand) {
  return render(
    <BrandContext.Provider value={brand}>
      <InvalidLinkMessage />
    </BrandContext.Provider>,
  )
}

describe('InvalidLinkMessage — le recours au support', () => {
  it('marque blanche : aucun bouton vers le support Bellum, le geste principal reste', () => {
    renderIn(resolveBrand({ brandName: 'Acme Conseil' }))

    expect(screen.getAllByText('Lien invalide').length).toBeGreaterThan(0)
    expect(screen.queryAllByRole('button', { name: 'Contacter le support' })).toHaveLength(0)
  })

  it('témoin : un espace à la marque du produit garde le bouton', () => {
    renderIn(resolveBrand(null))

    expect(screen.getAllByRole('button', { name: 'Contacter le support' }).length).toBeGreaterThan(0)
  })
})
