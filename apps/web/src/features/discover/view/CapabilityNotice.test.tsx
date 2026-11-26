import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { CapabilityNotice } from './CapabilityNotice'

const capabilities = [{ source: 'gouv_fr', reason: 'revenue_min', kind: 'capability' as const }]

/**
 * #4588 — « Résultats plus larges que demandé » / « Aucune entreprise ne manque » à côté de « Aucune entreprise ne
 * correspond » : le bandeau décrit un élargissement qui n'a rien ramené. Sans résultat, il ne dit RIEN (on
 * n'affirme pas ce qu'on n'a pas mesuré) ; avec des résultats, il reste.
 */
describe('#4588 — CapabilityNotice sur un résultat vide', () => {
  it('avec des résultats : le bandeau dit l’élargissement', () => {
    render(<CapabilityNotice capabilities={capabilities} shown={4} />)
    expect(screen.getByText('Résultats plus larges que demandé')).toBeVisible()
    expect(screen.getByText(/aucune entreprise ne manque/i)).toBeVisible()
  })

  it('SAIT DIRE NON : liste vide → ni « plus larges que demandé », ni « aucune entreprise ne manque »', () => {
    const { container } = render(<CapabilityNotice capabilities={capabilities} shown={0} />)
    expect(screen.queryByText('Résultats plus larges que demandé')).toBeNull()
    expect(screen.queryByText(/aucune entreprise ne manque/i)).toBeNull()
    expect(container).toBeEmptyDOMElement()
  })
})
