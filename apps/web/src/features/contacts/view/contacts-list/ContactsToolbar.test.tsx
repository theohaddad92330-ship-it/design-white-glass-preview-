import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { ContactsToolbar } from './ContactsToolbar'

/**
 * #3527 (recette prod Y8 02/10) — « champ x273-529 (input 256 px dans wrapper
 * 384) et bouton Filtres x665 : écart 136 px ». Le groupe est borné à 384 px
 * mais `SearchInput size="sm"` fixe l'input à `w-48 lg:w-64` : le bouton, qui
 * suit le WRAPPER, partait 128 px plus loin que le champ. L'input remplit son
 * wrapper — le bouton est collé au champ.
 */
describe('ContactsToolbar — le bouton « Filtres » est collé au champ (#3527)', () => {
  it('l’input remplit son wrapper à toutes les largeurs (sm ET lg)', () => {
    render(
      <ContactsToolbar query="" onQueryChange={() => {}} filtersTrigger={<button type="button">Filtres</button>} />,
    )
    const input = screen.getByPlaceholderText(/./)
    expect(input).toHaveClass('w-full')
    expect(input).toHaveClass('lg:w-full')
  })
})
