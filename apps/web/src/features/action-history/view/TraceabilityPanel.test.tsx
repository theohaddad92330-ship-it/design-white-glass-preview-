import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { TraceabilityPanel } from './TraceabilityPanel'

/**
 * #1499 — « ce bloc prend beaucoup de largeur alors qu'il contient
 * principalement du contenu pédagogique statique ».
 *
 * Ces tests gardent les DEUX moitiés de la réparation, et la seconde est celle
 * qu'on oublie : réduire un bloc ne doit pas faire disparaître ce qu'il disait.
 */
describe('TraceabilityPanel — réduit, mais rien de perdu', () => {
  it('se présente replié : le détail n’occupe plus l’écran à chaque visite', () => {
    render(<TraceabilityPanel />)
    const toggle = screen.getByRole('button', { name: /journalise les actions/ })

    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByText('Traçabilité totale')).not.toBeInTheDocument()
  })

  it('garde la promesse de conformité VISIBLE même replié', () => {
    render(<TraceabilityPanel />)
    // Le retour veut moins de place, pas moins de promesse.
    expect(screen.getByText('Traçabilité & sécurité')).toBeInTheDocument()
  })

  it('rend ses trois preuves au clic — elles n’ont pas d’autre maison', () => {
    render(<TraceabilityPanel />)
    // ⚠️ La contre-épreuve du lot : `/settings/security` fait trente-sept lignes
    // et ne dit RIEN de la journalisation. Renvoyer là-bas aurait supprimé ces
    // preuves du produit au lieu de les déplacer.
    fireEvent.click(screen.getByRole('button', { name: /journalise les actions/ }))

    expect(screen.getByText('Traçabilité totale')).toBeInTheDocument()
    expect(screen.getByText('Collaboration renforcée')).toBeInTheDocument()
    expect(screen.getByText('Conformité & sécurité')).toBeInTheDocument()
  })
})
