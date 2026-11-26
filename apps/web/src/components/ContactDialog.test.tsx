import { resolveBrand, type Brand } from '@bellum/contracts'
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { BrandContext } from '@/features/brand/brand-context'
import { ContactDialog } from './ContactDialog'

/**
 * #1960.20 — LA BOÎTE DE SUPPORT EST LA NÔTRE, ET ELLE NE SE MONTRE PAS CHEZ UN CLIENT EN MARQUE BLANCHE.
 *
 * Décision de Louis du 13/09/2026 : dans un espace en marque blanche, aucune
 * adresse Bellum — ni dans la voix de Laura, ni à l'écran. Ce dialogue est le
 * seul endroit de l'app qui écrit l'adresse : c'est donc lui qui la retient.
 */
function renderIn(brand: Brand) {
  return render(
    <BrandContext.Provider value={brand}>
      <ContactDialog open onOpenChange={() => {}} />
    </BrandContext.Provider>,
  )
}

describe('ContactDialog', () => {
  it('espace en marque blanche : aucune adresse Bellum, aucun lien de messagerie', async () => {
    renderIn(resolveBrand({ brandName: 'Acme Conseil' }))

    expect(
      await screen.findByText("Pour toute question sur ton espace, adresse-toi à la personne qui l'administre."),
    ).toBeInTheDocument()
    expect(document.body.textContent).not.toMatch(/@bellum/i)
    expect(document.querySelector('a[href^="mailto:"]')).toBeNull()
  })

  it('témoin : un espace à la marque du produit garde l’adresse du support', async () => {
    renderIn(resolveBrand(null))

    expect(await screen.findByText('support@bellum-it.com')).toBeInTheDocument()
    expect(document.querySelector('a[href="mailto:support@bellum-it.com"]')).not.toBeNull()
  })
})
