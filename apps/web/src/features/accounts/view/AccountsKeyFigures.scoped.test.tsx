import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { AccountsKeyFigures } from './AccountsKeyFigures'

const COUNTERS = { total: 122, followed: 107, withoutNextAction: 107, activeRelations: 0, favorites: 4 }

/** #4643 — la bande décrit la liste rendue ; sans restriction, ses chiffres sont inchangés. */
describe('AccountsKeyFigures — périmètre', () => {
  it('SAIT DIRE NON : sans filtre les quatre chiffres du serveur sont inchangés', () => {
    render(<AccountsKeyFigures counters={COUNTERS} />)
    expect(screen.getByLabelText('Comptes dans l’espace : 122')).toBeVisible()
    // #4584 — les deux vues-filtres à zéro sont ABSENTES (le « 00 » mesuré en prod le 27/10 était ce défaut).
    expect(screen.queryByLabelText(/À reprendre/)).toBeNull()
    expect(screen.queryByLabelText(/Relations actives/)).toBeNull()
    expect(screen.getByLabelText('Favoris : 4')).toBeVisible()
  })

  it('liste restreinte : seul le total de la liste rendue est dit, jamais « 122 » au-dessus de zéro ligne', () => {
    render(<AccountsKeyFigures counters={COUNTERS} scoped renderedTotal={0} />)
    expect(screen.getByLabelText('Comptes affichés : 0')).toBeVisible()
    expect(screen.queryByText('122')).toBeNull()
    expect(screen.queryByText('Favoris')).toBeNull()
    expect(screen.queryByText('À reprendre')).toBeNull()
    expect(screen.queryByText('Relations actives')).toBeNull()
  })

  it('liste restreinte, total pas encore connu : aucun chiffre', () => {
    const { container } = render(<AccountsKeyFigures counters={COUNTERS} scoped />)
    expect(container).toBeEmptyDOMElement()
  })
})
