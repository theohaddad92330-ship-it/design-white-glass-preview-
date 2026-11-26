import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { PlanSalesContext } from './PlanSalesContext'
import type { SalesContextView } from './planViewData'

/**
 * #2645.2 — le modèle de revenu change l'angle proposé et la cadence de
 * relance. Le commercial voit donc le FAIT qui a produit ces deux changements :
 * une date de relance qu'on ne peut pas expliquer n'est pas une recommandation,
 * c'est un verdict.
 *
 * GA-18/GA-19 : `inconnu` n'est pas une valeur à afficher — un modèle de revenu
 * non déclaré ne devient jamais un badge.
 */
const context = (revenueModel: string): SalesContextView => ({
  esnStage: 'petite',
  salesStructure: '',
  revenueModel,
  rankPosition: '',
  account: null,
  relationship: null,
})

describe('PlanSalesContext — le modèle de revenu (#2645.2)', () => {
  it('affiche le modèle déclaré à côté du stade', () => {
    render(<PlanSalesContext salesContext={context('ponctuel')} />)
    expect(screen.getByText('Revenu au projet')).toBeInTheDocument()
  })

  it('n’affiche RIEN pour un modèle non déclaré', () => {
    render(<PlanSalesContext salesContext={context('inconnu')} />)
    expect(screen.queryByText(/salesContext\.revenueModels\./)).not.toBeInTheDocument()
  })

  it('n’affiche RIEN quand le champ est absent du dossier', () => {
    render(<PlanSalesContext salesContext={context('')} />)
    expect(screen.queryByText(/salesContext\.revenueModels\./)).not.toBeInTheDocument()
  })
})
