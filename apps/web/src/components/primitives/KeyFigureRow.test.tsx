import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { KeyFigureRow, padKeyFigure } from './KeyFigureRow'

/**
 * F2-FIX #4332 — LA RANGÉE DE CHIFFRES CLÉS, UN SEUL COMPOSANT pour Comptes, Pipe et Vivier.
 * Recette du 20/10 : rien sur Comptes, quatre cartes sur Pipe, cinq pastilles sur Vivier.
 */
describe('KeyFigureRow', () => {
  it('rend une tuile par chiffre, avec son libellé nommé à l’écran', () => {
    render(
      <KeyFigureRow
        figures={[
          { id: 'a', label: 'Comptes', value: 12 },
          { id: 'b', label: 'Actifs', value: '5', meta: 'sur 12' },
        ]}
      />,
    )
    expect(screen.getByText('Comptes')).toBeVisible()
    expect(screen.getByText('12')).toBeVisible()
    expect(screen.getByLabelText('Actifs : 5')).toBeInTheDocument()
    expect(screen.getByText('sur 12')).toBeVisible()
  })

  it('SAIT DIRE NON : une valeur absente ne fait aucune tuile, un vrai zéro en fait une', () => {
    render(
      <KeyFigureRow
        figures={[
          { id: 'a', label: 'Absent nul', value: null },
          { id: 'b', label: 'Absent indéfini', value: undefined },
          { id: 'c', label: 'Absent vide', value: '' },
          { id: 'd', label: 'Zéro réel', value: 0 },
        ]}
      />,
    )
    expect(screen.queryByText('Absent nul')).toBeNull()
    expect(screen.queryByText('Absent indéfini')).toBeNull()
    expect(screen.queryByText('Absent vide')).toBeNull()
    expect(screen.getByText('Zéro réel')).toBeVisible()
    expect(screen.getByText('00')).toBeVisible()
  })

  it('ne rend RIEN du tout quand aucun chiffre n’est connu — ni cadre vide', () => {
    const { container } = render(<KeyFigureRow figures={[{ id: 'a', label: 'x', value: null }]} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('le chiffre porte le rôle keyFigure de l’échelle typographique', () => {
    render(<KeyFigureRow figures={[{ id: 'a', label: 'Comptes', value: 3 }]} />)
    expect(screen.getByText('03').className).toContain('text-lg')
  })

  // #4582 — TRANCHÉ PAR LOUIS LE 26/10 (renverse le lot précédent, qui avait retiré le `padStart`) : la maquette Théo V22
  // écrit `n.toString().padStart(2,'0')` sur `.a4-counters` et « maquettes Théo appliquées EXACTEMENT » (19/10) prime.
  // Le zéro-complété se pose PARTOUT de la même façon : une seule fonction, y compris sur 0 ; jamais de troncature.
  it('#4582 SAIT DIRE NON : 4 → « 04 », 0 → « 00 », 1234 → « 1234 » (jamais tronqué)', () => {
    expect(padKeyFigure(4)).toBe('04')
    expect(padKeyFigure(0)).toBe('00')
    expect(padKeyFigure(1234)).toBe('1234')
    // #4582 (reformulé) — cohérence de la rangée : 2 → « 02 », 0 → « 00 », 105 → « 105 », jamais tronqué ni mêlé.
    expect(padKeyFigure(2)).toBe('02')
    expect(padKeyFigure(105)).toBe('105')
    expect(padKeyFigure(4)).not.toBe('4')
  })

  it('#4582 la bande ET les tuiles écrivent le même « 04 » ; le nom accessible garde le nombre brut', () => {
    const figures = [
      { id: 'a', label: 'Favoris', value: 4 },
      { id: 'b', label: 'Vide', value: 0 },
      { id: 'c', label: 'Grand', value: 66746 },
    ]
    const { rerender } = render(<KeyFigureRow variant="band" figures={figures} />)
    expect(screen.getByText('04')).toBeVisible()
    expect(screen.getByText('00')).toBeVisible()
    expect(screen.getByText('66746')).toBeVisible()
    expect(screen.getByLabelText('Favoris : 4')).toBeInTheDocument()
    rerender(<KeyFigureRow figures={figures} />)
    expect(screen.getByText('04')).toBeVisible()
    expect(screen.getByText('00')).toBeVisible()
  })
})
