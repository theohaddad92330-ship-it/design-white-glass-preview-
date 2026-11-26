import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import '@/i18n'
import { OfferUnderstood } from './OfferUnderstood'

// LUDOVIC-E LC.6 — « Ce que Bellum a compris » (positionnement) doit se lire dans /discover, pas seulement au profil.
describe('OfferUnderstood', () => {
  it('nomme le type de société, les domaines et le positionnement (Régie pure)', () => {
    render(
      <OfferUnderstood
        companyType="industrial_engineering"
        offerDomains={[]}
        positioning="Régie pure - on place des profils sur demande"
      />,
    )
    expect(screen.getByText(/Ce que .* a compris/)).toBeTruthy()
    expect(screen.getByText(/société de conseil en ingénierie industrielle/)).toBeTruthy()
    expect(screen.getByTestId('understood-positioning').textContent).toMatch(/Régie pure/)
  })

  it('dit NON à ce qu’il n’a pas : rien d’affiché en mode discret sans type ni positionnement', () => {
    const { container } = render(<OfferUnderstood companyType={null} offerDomains={[]} positioning="" quietWhenEmpty />)
    expect(container.textContent).toBe('')
  })

  it('sans mode discret, l’aveu « aucun domaine » reste (écran du profil)', () => {
    render(<OfferUnderstood companyType={null} offerDomains={[]} positioning="" />)
    expect(screen.getByText(/ne peut pas encore dire ce que tu vends/)).toBeTruthy()
  })
})
