import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { AccountsKeyFigures, activeKeyFigureOf } from './AccountsKeyFigures'

/**
 * Refonte Théo (comptes-liste) — quatre tuiles : Comptes dans l'espace · À reprendre · Relations actives ·
 * Favoris. Ce que le serveur n'a pas calculé ne fait aucune tuile (GA-18/19), jamais « 0 ».
 */
describe('AccountsKeyFigures', () => {
  it('nomme les quatre chiffres, avec la phrase qui dit ce qu’ils comptent', () => {
    render(
      <AccountsKeyFigures
        counters={{ total: 14, followed: 10, withoutNextAction: 3, activeRelations: 4, favorites: 2 }}
      />,
    )
    expect(screen.getByLabelText('Comptes dans l’espace : 14')).toBeVisible()
    expect(screen.getByLabelText('À reprendre : 7')).toBeVisible()
    expect(screen.getByLabelText('Relations actives : 4')).toBeVisible()
    expect(screen.getByLabelText('Favoris : 2')).toBeVisible()
    expect(screen.getByText('Une action est prévue')).toBeVisible()
    expect(screen.getByText('Compte client ou mission en cours')).toBeVisible()
    expect(screen.getByText('Tes comptes épinglés')).toBeVisible()
  })

  it('SAIT DIRE NON : « À reprendre » exige les deux compteurs dont il se déduit', () => {
    render(<AccountsKeyFigures counters={{ total: 14, followed: 10 }} />)
    expect(screen.getByLabelText('Comptes dans l’espace : 14')).toBeVisible()
    expect(screen.queryByText('À reprendre')).toBeNull()
    expect(screen.queryByText('Relations actives')).toBeNull()
    expect(screen.queryByText('Favoris')).toBeNull()
    expect(screen.queryByText('0')).toBeNull()
  })

  it('un vrai zéro reste dit, et sans compteurs la rangée ne rend rien', () => {
    const { container, rerender } = render(<AccountsKeyFigures counters={{ favorites: 0 }} />)
    expect(screen.getByLabelText('Favoris : 0')).toBeVisible()
    rerender(<AccountsKeyFigures counters={undefined} />)
    expect(container).toBeEmptyDOMElement()
  })

  // #4584 (recette prod 27/10, Louis) — « À reprendre 00 » et « Relations actives 00 » au-dessus de trois cartes
  // « Reprendre le fil » : une vue-filtre qui ne compte rien n'a rien à montrer, la tuile est ABSENTE, pas « 00 ».
  it('#4584 — « À reprendre » et « Relations actives » à zéro ne font AUCUNE tuile', () => {
    render(
      <AccountsKeyFigures
        counters={{ total: 124, followed: 5, withoutNextAction: 5, activeRelations: 0, favorites: 4 }}
      />,
    )
    expect(screen.queryByLabelText(/À reprendre/)).toBeNull()
    expect(screen.queryByLabelText(/Relations actives/)).toBeNull()
    expect(screen.getByLabelText('Comptes dans l’espace : 124')).toBeVisible()
    expect(screen.getByLabelText('Favoris : 4')).toBeVisible()
  })

  it('#4584 — sans zéro, les quatre tuiles restent (la règle ne retire que les vues-filtres vides)', () => {
    render(
      <AccountsKeyFigures
        counters={{ total: 14, followed: 10, withoutNextAction: 3, activeRelations: 4, favorites: 0 }}
      />,
    )
    expect(screen.getByLabelText('À reprendre : 7')).toBeVisible()
    expect(screen.getByLabelText('Relations actives : 4')).toBeVisible()
    expect(screen.getByLabelText('Favoris : 0')).toBeVisible()
  })

  it('chaque chiffre est un bouton qui pose SA vue, et celui de la vue courante est allumé', () => {
    const onSelect = vi.fn()
    render(
      <AccountsKeyFigures
        counters={{ total: 14, followed: 10, withoutNextAction: 3, activeRelations: 4, favorites: 2 }}
        active="toResume"
        onSelect={onSelect}
      />,
    )
    expect(screen.getByRole('button', { name: 'À reprendre : 7' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'Comptes dans l’espace : 14' })).toHaveAttribute('aria-pressed', 'false')
    fireEvent.click(screen.getByRole('button', { name: 'Relations actives : 4' }))
    expect(onSelect).toHaveBeenCalledWith('activeRelations')
    fireEvent.click(screen.getByRole('button', { name: 'Favoris : 2' }))
    expect(onSelect).toHaveBeenLastCalledWith('favorites')
  })

  it('le chiffre allumé se LIT dans l’URL — un filtre de bandeau étranger n’en allume aucun', () => {
    expect(activeKeyFigureOf({})).toBe('total')
    expect(activeKeyFigureOf({ headline: 'toResume' })).toBe('toResume')
    expect(activeKeyFigureOf({ headline: 'activeRelations' })).toBe('activeRelations')
    expect(activeKeyFigureOf({ favorite: 'mine' })).toBe('favorites')
    expect(activeKeyFigureOf({ headline: 'newSignals7d' })).toBeUndefined()
  })
})

// #4582 (Louis 26/10) — recette attendue : `/accounts` affiche « Favoris 04 ».
describe('AccountsKeyFigures — zéro-complété', () => {
  it('« Favoris 04 » : le chiffre visible est complété, le nom accessible garde 4', () => {
    render(<AccountsKeyFigures counters={{ total: 14, favorites: 4 }} />)
    expect(screen.getByRole('group', { name: 'Favoris : 4' })).toHaveTextContent(/Favoris\s*04/)
  })
})
