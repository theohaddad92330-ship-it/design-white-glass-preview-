import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { ListingFilterNotice } from './ListingFilterNotice'

/**
 * #4361.2 — « Exclure les sociétés cotées » dit ce qu'il a fait en nombres : combien retirées,
 * combien dont la cotation n'est pas établie (restées, jamais comptées « non cotées »), et quand
 * la vérification n'a pas pu se faire, que rien n'a été retiré.
 */
describe('ListingFilterNotice', () => {
  it('sans interrupteur posé (`filter` absent), ne rend RIEN — pas un « 0 retirée »', () => {
    const { container } = render(<ListingFilterNotice filter={undefined} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('nomme les sociétés retirées ET les cotations non établies restées dans la liste', () => {
    render(
      <ListingFilterNotice filter={{ applied: true, excludedCount: 3, unknownCount: 21, sourceAvailable: true }} />,
    )
    expect(screen.getByText(/3 sociétés cotées retirées de la liste/)).toBeInTheDocument()
    expect(screen.getByText(/Cotation non établie pour 21 comptes/)).toBeInTheDocument()
  })

  it('le singulier s’accorde', () => {
    render(<ListingFilterNotice filter={{ applied: true, excludedCount: 1, unknownCount: 1, sourceAvailable: true }} />)
    expect(screen.getByText(/1 société cotée retirée de la liste/)).toBeInTheDocument()
    expect(screen.getByText(/Cotation non établie pour 1 compte :/)).toBeInTheDocument()
  })

  it('aucune retirée se dit, sans prétendre que le reste est « non coté »', () => {
    render(<ListingFilterNotice filter={{ applied: true, excludedCount: 0, unknownCount: 5, sourceAvailable: true }} />)
    expect(screen.getByText(/Aucune société cotée n’a été retirée/)).toBeInTheDocument()
    expect(screen.queryByText(/^Non cotée/i)).not.toBeInTheDocument()
  })

  it('index muet : rien n’a été retiré, et le dit — pas de compte de « non cotées »', () => {
    render(
      <ListingFilterNotice filter={{ applied: true, excludedCount: 0, unknownCount: 8, sourceAvailable: false }} />,
    )
    expect(screen.getByText(/La cotation n’a pas pu être vérifiée/)).toBeInTheDocument()
    expect(screen.queryByText(/Cotation non établie pour/)).not.toBeInTheDocument()
  })
})
