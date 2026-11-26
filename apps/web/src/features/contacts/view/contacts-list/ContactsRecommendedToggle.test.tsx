import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { ContactsRecommendedToggle } from './ContactsRecommendedToggle'

/**
 * #4581 — « Tous 65923 » devenait « Tous 1014 » sous `source=mon_crm` : un libellé d'espace sur un chiffre de
 * vue. Le couple « Recommandés / Tous » compte la VUE (filtres posés) ; dès qu'un filtre est posé, les segments
 * le DISENT. Sans filtre, la vue EST l'espace et le libellé reste « Tous ».
 */
describe('#4581 — le couple Tous / Recommandés dit ce qu’il compte', () => {
  const counts = { recommended: 300, all: 1014 }

  it('sans filtre : « Tous » et « Recommandés », nus', () => {
    render(<ContactsRecommendedToggle counts={counts} value="all" onChange={vi.fn()} filtered={false} />)
    // #4661 — le segment ACTIF ne répète pas le total que l'en-tête du répertoire écrit déjà (GA-26) ; l'autre garde le sien.
    expect(screen.getByRole('button', { name: /^Tous collectés/ })).toHaveTextContent(/^Tous collectés$/)
    expect(screen.getByRole('button', { name: /^Recommandés/ })).toHaveTextContent('Recommandés300')
    expect(screen.queryByText(/dans la vue/)).toBeNull()
  })

  it('SAIT DIRE NON : sous filtre, le chiffre n’est plus présenté comme un total d’espace', () => {
    render(<ContactsRecommendedToggle counts={counts} value="all" onChange={vi.fn()} filtered />)
    expect(screen.getByRole('button', { name: /Tous collectés dans la vue/ })).toHaveTextContent(
      /^Tous collectés dans la vue$/,
    )
    expect(screen.getByRole('button', { name: /Recommandés dans la vue/ })).toHaveTextContent('300')
    expect(screen.queryByRole('button', { name: /^Tous\s*1014$/ })).toBeNull()
  })

  it('#4661 SAIT DIRE NON : le chiffre du segment actif n’est écrit nulle part dans la bascule', () => {
    render(<ContactsRecommendedToggle counts={counts} value="recommended" onChange={vi.fn()} filtered={false} />)
    expect(screen.getByRole('button', { name: /^Recommandés/ })).toHaveTextContent(/^Recommandés$/)
    expect(screen.getByRole('button', { name: /^Tous collectés/ })).toHaveTextContent('Tous collectés1014')
    expect(screen.queryByText('300')).toBeNull()
  })

  it('#4770 le segment nomme ce qu’il compte : les contacts collectés, jamais un « Tous » qui laisse croire à une possession', () => {
    render(
      <ContactsRecommendedToggle counts={{ recommended: 300, all: 69773 }} value="recommended" onChange={vi.fn()} />,
    )
    const all = screen.getByRole('button', { name: /collectés/ })
    expect(all).toHaveTextContent('Tous collectés69773')
    expect(screen.queryByRole('button', { name: /^Tous\s*69773$/ })).toBeNull()
  })
})
