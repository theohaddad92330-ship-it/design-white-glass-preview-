/** #3499 — la ligne d'identité ne dit jamais « salariés salariés ». */
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { AccountHeroFacts } from './AccountHeroFacts'

function monter(employees: string | null) {
  render(<AccountHeroFacts account={{ headquarters: null, employees, revenue: null }} />)
}

describe('#3499 — AccountHeroFacts effectif', () => {
  it('une valeur déjà suffixée n’est pas re-suffixée', () => {
    monter('1 000 à 1 999 salariés')
    expect(screen.getByTestId('hero-fact-size').textContent).toBe('1 000 à 1 999 salariés')
  })

  it('une valeur brute reçoit le mot une seule fois', () => {
    monter('5 000')
    expect(screen.getByTestId('hero-fact-size').textContent).toBe('5 000 salariés')
  })

  it('SAIT DIRE NON — effectif absent : aucune ligne', () => {
    monter(null)
    expect(screen.queryByTestId('hero-fact-size')).toBeNull()
  })

  // #3861 (VU, recette prod 09/10, Sanofi) — « le groupe est décrit comme mondial
  // salariés » : la colonne `employees` porte parfois un SCOPE (« mondial »), pas un
  // effectif chiffré — le registre ne connaît l'ampleur du groupe que par sa portée,
  // pas par un décompte nominatif. Accoler « salariés » à ce mot produit un non-sens,
  // jamais une phrase trouée (aucun chiffre n'est inventé pour autant — la valeur
  // brute reste affichée telle quelle, elle n'est simplement pas prise pour un compte).
  it('une valeur sans aucun chiffre (un SCOPE, « mondial ») ne reçoit pas « salariés »', () => {
    monter('mondial')
    expect(screen.getByTestId('hero-fact-size').textContent).toBe('mondial')
  })
})
