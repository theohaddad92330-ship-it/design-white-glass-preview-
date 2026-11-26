import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { AuthBrandingPanel } from './AuthBrandingPanel'

// recette MV 10/10 — le panneau d'accueil annonçait « 12 comptes · 38 contacts ·
// 7 actions » (chiffres de décor), alors que /contacts en démo compte 138 / 3908.
// On n'affiche pas un chiffre qu'on n'a pas : des rubriques, jamais un compte.
describe("AuthBrandingPanel — l'itinéraire 01-03, sans chiffre de décor", () => {
  it('nomme trois étapes numérotées et aucun compte inventé', () => {
    const { container } = render(<AuthBrandingPanel />)
    expect(container.textContent ?? '').not.toMatch(/\b(12|38|7)\s+(comptes|contacts|actions|accounts)\b/i)
    expect(screen.getAllByRole('listitem')).toHaveLength(3)
    expect(screen.getAllByRole('heading', { level: 3 })).toHaveLength(3)
    expect(container.textContent ?? '').toMatch(/01.*02.*03/s)
  })

  it('sépare les étapes par un filet et garde le numéro discret (`.ob23-itinerary`), pas une pastille', () => {
    render(<AuthBrandingPanel />)
    for (const item of screen.getAllByRole('listitem')) {
      expect(item.className).toMatch(/border-t/)
      expect(item.firstElementChild?.className).not.toMatch(/rounded-full/)
    }
  })
})
