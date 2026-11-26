import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { DecisionLevelNotice } from './DecisionLevelNotice'

/** #3528 (recette 03/10) — un vide ne reste jamais muet. */
describe('DecisionLevelNotice', () => {
  it('liste vide : dit combien de comptes sont écartés et pourquoi', () => {
    render(<DecisionLevelNotice state={{ kind: 'ready', unit: 'accounts', removedCount: 25, shown: 0 }} />)
    expect(screen.getByText('25 comptes écartés : niveau de décision inconnu pour leurs contacts.')).toBeInTheDocument()
    expect(screen.getByText(/aucun contact connu de ton espace n’a le niveau choisi/)).toBeInTheDocument()
  })

  it('un seul compte écarté : le singulier', () => {
    render(<DecisionLevelNotice state={{ kind: 'ready', unit: 'accounts', removedCount: 1, shown: 4 }} />)
    expect(screen.getByText('1 compte écarté : niveau de décision inconnu pour ses contacts.')).toBeInTheDocument()
    expect(screen.queryByText(/La liste est vide/)).toBeNull()
  })

  it('vue Contacts : parle de contacts, pas de comptes', () => {
    render(<DecisionLevelNotice state={{ kind: 'ready', unit: 'contacts', removedCount: 3, shown: 2 }} />)
    expect(screen.getByText(/3 contacts écartés/)).toBeInTheDocument()
  })

  it('contacts en lecture : le dit, ne prétend pas filtrer', () => {
    render(<DecisionLevelNotice state={{ kind: 'loading' }} />)
    expect(screen.getByText(/Lecture des contacts de ton espace/)).toBeInTheDocument()
  })

  it('contacts illisibles : le dit', () => {
    render(<DecisionLevelNotice state={{ kind: 'error' }} />)
    expect(screen.getByText(/n’ont pas pu être lus/)).toBeInTheDocument()
  })

  it('sait dire RIEN : filtre éteint, ou rien d’écarté (jamais « 0 écarté »)', () => {
    const { container, rerender } = render(<DecisionLevelNotice state={{ kind: 'off' }} />)
    expect(container).toBeEmptyDOMElement()
    rerender(<DecisionLevelNotice state={{ kind: 'ready', unit: 'accounts', removedCount: 0, shown: 7 }} />)
    expect(container).toBeEmptyDOMElement()
  })
})
