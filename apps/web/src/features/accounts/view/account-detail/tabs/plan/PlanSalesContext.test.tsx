import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { PlanSalesContext } from './PlanSalesContext'
import type { SalesContextView } from './planViewData'

/**
 * #2645.1 — « clients finaux via un partenaire, rang 2 » doit se RELIRE dans le
 * profil du dossier (Plan › le profil qui a produit les recos), pas seulement
 * exister dans le questionnaire. Un rang non mesuré (« inconnu ») ne s'affiche
 * jamais comme un fait — la carte le tait plutôt que d'inventer un rang1.
 */
function view(overrides: Partial<SalesContextView> = {}): SalesContextView {
  return {
    esnStage: 'petite',
    salesStructure: '',
    revenueModel: '',
    rankPosition: '',
    account: null,
    relationship: null,
    ...overrides,
  }
}

describe('PlanSalesContext — #2645.1 le rang se relit dans le profil', () => {
  it('affiche « Sous-traitant (rang 2) » quand le profil déclare rang2', () => {
    render(<PlanSalesContext salesContext={view({ rankPosition: 'rang2' })} />)
    expect(screen.getByText('Sous-traitant (rang 2)')).toBeInTheDocument()
  })

  it('ne dit rien quand le rang n’est pas mesuré (« inconnu »)', () => {
    render(<PlanSalesContext salesContext={view({ rankPosition: 'inconnu' })} />)
    expect(screen.queryByText(/rang/i)).not.toBeInTheDocument()
  })

  it('ne dit rien quand le rang est vide', () => {
    render(<PlanSalesContext salesContext={view({ rankPosition: '' })} />)
    expect(screen.queryByText(/rang/i)).not.toBeInTheDocument()
  })
})
