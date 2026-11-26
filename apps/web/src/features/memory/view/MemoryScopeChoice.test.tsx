import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { offerableMemoryScopes } from '@bellum/contracts'
import { MemoryScopeChoice } from './MemoryScopeChoice'

/**
 * #1918.2 / #1918.5 — « POUR QUI ? » PROPOSE CE QU'IL PEUT TENIR, ET RIEN DE PLUS.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LA RÉGRESSION QUE CETTE GARDE EMPÊCHE
 * ─────────────────────────────────────────────────────────────────────────────
 * Ce composant parcourait `memoryItemScopes`, l'énumération entière. Les deux
 * portées ajoutées par ce lot y seraient apparues TOUTES SEULES, partout — y
 * compris dans Réglages › Mémoire, où « cette conversation » ne désigne aucun
 * fil, et chez qui ne porte aucun périmètre, où « mon équipe » ne filtre rien.
 * Un bouton radio qu'on ne peut pas honorer est une promesse fausse, et la
 * contrainte SQL le refuserait de toute façon.
 *
 * Elle LIT quelque chose : les trois premiers cas comptent des boutons réels
 * rendus par le vrai composant, et le dernier vérifie qu'un clic remonte le
 * choix ENTIER (la portée ET ce qu'elle désigne) — un composant qui ne
 * rendrait rien ferait tomber les quatre.
 *
 * Elle sait dire NON — mesuré : `options` remplacé par `memoryItemScopes`
 * (l'ancien comportement), le TÉMOIN tombe sur « 4 boutons au lieu de 2 ».
 *
 * Elle n'attrape pas ce qu'elle ne vise pas : le TÉMOIN est précisément le cas
 * d'avant ce lot — deux choix, mêmes libellés, même ordre.
 */
describe('MemoryScopeChoice — les portées PROPOSABLES (#1918.2 / #1918.5)', () => {
  const radios = () => screen.getAllByRole('radio').map(input => (input as HTMLInputElement).value)

  it('TÉMOIN — sans contexte, DEUX choix, ceux d’avant ce lot, dans le même ordre', () => {
    render(<MemoryScopeChoice options={offerableMemoryScopes({})} value={{ scope: 'user' }} onChange={vi.fn()} />)
    expect(radios()).toEqual(['user:', 'workspace:'])
    expect(screen.getByRole('radio', { name: 'Toi uniquement' })).toBeChecked()
    expect(screen.queryByRole('radio', { name: 'Cette conversation' })).toBeNull()
  })

  it('#1918.5 — dans un fil, « Cette conversation » s’ajoute EN DERNIER, et dit qu’elle ne lui survit pas', () => {
    render(
      <MemoryScopeChoice
        options={offerableMemoryScopes({ conversationId: 'fil-1' })}
        value={{ scope: 'conversation', conversationId: 'fil-1' }}
        onChange={vi.fn()}
      />,
    )
    expect(radios()).toEqual(['user:', 'workspace:', 'conversation:'])
    expect(screen.getByText(/Sert à ce fil seulement/)).toBeInTheDocument()
  })

  it('#1918.2 — un périmètre se NOMME : un choix PAR périmètre porté, jamais un « mon équipe » générique', () => {
    render(
      <MemoryScopeChoice
        options={offerableMemoryScopes({
          businessUnits: [
            { id: 'bu-1', name: 'Agence Lyon' },
            { id: 'bu-2', name: 'Practice Data' },
          ],
        })}
        value={{ scope: 'business_unit', businessUnitId: 'bu-1', businessUnitName: 'Agence Lyon' }}
        onChange={vi.fn()}
      />,
    )
    expect(radios()).toEqual(['user:', 'workspace:', 'business_unit:bu-1', 'business_unit:bu-2'])
    expect(screen.getByRole('radio', { name: 'Agence Lyon' })).toBeChecked()
    expect(screen.getByText(/Visible par les membres de Agence Lyon/)).toBeInTheDocument()
  })

  it('le choix remonte ENTIER — la portée ET ce qu’elle désigne, sans que l’écran ait à le retrouver', () => {
    const onChange = vi.fn()
    render(
      <MemoryScopeChoice
        options={offerableMemoryScopes({
          conversationId: 'fil-1',
          businessUnits: [{ id: 'bu-1', name: 'Agence Lyon' }],
        })}
        value={{ scope: 'user' }}
        onChange={onChange}
      />,
    )
    fireEvent.click(screen.getByRole('radio', { name: 'Agence Lyon' }))
    expect(onChange).toHaveBeenCalledWith({
      scope: 'business_unit',
      businessUnitId: 'bu-1',
      businessUnitName: 'Agence Lyon',
    })
    fireEvent.click(screen.getByRole('radio', { name: 'Cette conversation' }))
    expect(onChange).toHaveBeenCalledWith({ scope: 'conversation', conversationId: 'fil-1' })
  })
})
