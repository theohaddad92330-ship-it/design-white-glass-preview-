import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { SectorCoverageNotice } from './SectorCoverageNotice'

// #4358.3 — le secteur cherché a peu de résultats ou un NAF mal connu : l'écran le DIT.
describe('SectorCoverageNotice', () => {
  it('peu de résultats : dit le vrai compte et que la liste peut être incomplète', () => {
    render(<SectorCoverageNotice reading={{ kind: 'thin', count: 5 }} />)
    expect(screen.getByRole('status')).toHaveTextContent(/5 entreprises/)
    expect(screen.getByRole('status')).toHaveTextContent(/secteur/i)
  })

  it('NAF mal connu : dit « K sur N », jamais un zéro', () => {
    render(<SectorCoverageNotice reading={{ kind: 'naf', known: 3, total: 12 }} />)
    expect(screen.getByRole('status')).toHaveTextContent(/3 sur 12/)
  })

  it('sait dire NON : aucune lecture → aucun message', () => {
    const { container } = render(<SectorCoverageNotice reading={null} />)
    expect(container).toBeEmptyDOMElement()
  })
})
