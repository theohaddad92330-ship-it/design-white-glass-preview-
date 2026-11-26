import { render, screen } from '@testing-library/react'
import { EntityTypeFilteredNotice } from './EntityTypeFilteredNotice'

// #4746.6 — la raison de l'exclusion se lit SUR la liste : combien de comptes le filtre « Clients finaux » a retirés.
describe('avis du filtre « Clients finaux »', () => {
  it('dit combien de comptes ont été retirés et pourquoi', () => {
    render(<EntityTypeFilteredNotice removed={3} entityType="client" />)
    expect(screen.getByRole('status')).toHaveTextContent('3 entreprises retirées')
    expect(screen.getByRole('status')).toHaveTextContent('ESN')
  })

  it('accorde le singulier', () => {
    render(<EntityTypeFilteredNotice removed={1} entityType="client" />)
    expect(screen.getByRole('status')).toHaveTextContent('1 entreprise retirée')
  })

  it('se tait quand le compteur est absent ou nul — jamais « 0 retirée »', () => {
    const { container, rerender } = render(<EntityTypeFilteredNotice removed={undefined} entityType="client" />)
    expect(container).toBeEmptyDOMElement()
    rerender(<EntityTypeFilteredNotice removed={0} entityType="client" />)
    expect(container).toBeEmptyDOMElement()
  })

  it('se tait quand le filtre « Clients finaux » n’est pas posé', () => {
    const { container } = render(<EntityTypeFilteredNotice removed={4} entityType="esn" />)
    expect(container).toBeEmptyDOMElement()
  })
})
