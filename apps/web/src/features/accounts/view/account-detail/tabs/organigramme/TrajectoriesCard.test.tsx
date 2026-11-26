import { render, screen } from '@testing-library/react'
import type { Contact } from '@bellum/contracts'
import { describe, expect, it } from 'vitest'
import { TrajectoriesCard } from './TrajectoriesCard'

/**
 * #3402 — LES TRAJECTOIRES COMMERCIALES, PAS UN FAUX ORGANIGRAMME.
 *
 * Ce que ces tests tiennent :
 *  - un sponsor (`economic`) ET un relais terrain (`champion`) font apparaître
 *    TROIS trajectoires — par le haut, par le terrain, ET en parallèle ;
 *  - une trajectoire portée par une seule personne nomme son risque ;
 *  - sans aucun contact classé, la carte ne se rend PAS DU TOUT (doctrine « on
 *    n'affiche pas ce qu'on n'a pas »).
 */

const contact = (over: Partial<Contact> & { id: string; full_name: string }): Contact =>
  ({ title: null, decision_role: null, priority: 3, photo_url: null, ...over }) as Contact

describe('TrajectoriesCard', () => {
  it('un sponsor et un relais terrain font apparaître le haut, le terrain, et le parallèle', () => {
    render(
      <TrajectoriesCard
        contacts={[
          contact({ id: 'c1', full_name: 'Anne Dupuis', decision_role: 'economic' }),
          contact({ id: 'c2', full_name: 'Marc Leroy', decision_role: 'champion' }),
        ]}
      />,
    )
    expect(screen.getByText('Trajectoires commerciales')).toBeInTheDocument()
    expect(screen.getByText('Par le haut')).toBeInTheDocument()
    expect(screen.getByText('Par le terrain')).toBeInTheDocument()
    expect(screen.getByText('En parallèle')).toBeInTheDocument()
    expect(screen.queryByText('Par un manager intermédiaire')).not.toBeInTheDocument()
  })

  it('une trajectoire à une seule personne nomme son risque', () => {
    render(<TrajectoriesCard contacts={[contact({ id: 'c1', full_name: 'Anne Dupuis', decision_role: 'economic' })]} />)
    expect(
      screen.getByText('Cette trajectoire ne repose que sur une seule personne — sans elle, il n’y a plus de porte.'),
    ).toBeInTheDocument()
  })

  it('sans aucun contact classé, la carte RESTE et dit pourquoi (#3402, recette 30/09)', () => {
    render(<TrajectoriesCard contacts={[contact({ id: 'c1', full_name: 'Sans rôle', decision_role: 'unknown' })]} />)
    expect(screen.getByText('Trajectoires commerciales')).toBeInTheDocument()
    expect(screen.getByText(/le contact découvert n’a pas de rôle de décision classé/)).toBeInTheDocument()
    expect(screen.queryByText('Par le haut')).not.toBeInTheDocument()
  })

  it('sans aucun contact, l’état vide le dit aussi', () => {
    render(<TrajectoriesCard contacts={[]} />)
    expect(screen.getByText(/Aucune trajectoire pour l’instant : aucun contact/)).toBeInTheDocument()
  })

  it('des contacts classés hors trajectoire d’entrée (achats) nomment ce qui manque', () => {
    render(<TrajectoriesCard contacts={[contact({ id: 'c1', full_name: 'Acheteur', decision_role: 'procurement' })]} />)
    expect(screen.getByText(/aucun n’est sponsor, utilisateur ou manager/)).toBeInTheDocument()
  })
})
