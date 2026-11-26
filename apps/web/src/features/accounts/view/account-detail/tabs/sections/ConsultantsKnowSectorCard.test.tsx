import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ConsultantSectorKnowledgeList } from '@bellum/contracts'

// #5017.2 — « consultants qui connaissent ce secteur » : une ligne par consultant AVEC secteur sourcé, sinon rien.
type QueryState = { data?: ConsultantSectorKnowledgeList; isPending: boolean; isError: boolean }
const state: { current: QueryState } = { current: { data: undefined, isPending: true, isError: false } }

vi.mock('@/features/accounts/hooks/useConsultantsKnowingSector', () => ({
  useConsultantsKnowingSector: () => state.current,
}))

const { ConsultantsKnowSectorCard } = await import('./ConsultantsKnowSectorCard')

beforeEach(() => {
  state.current = { data: undefined, isPending: true, isError: false }
})
afterEach(cleanup)

describe('#5017.2 — carte « consultants qui connaissent ce secteur »', () => {
  it('liste chaque consultant avec le secteur de sa fiche qui recoupe celui du compte', () => {
    state.current = {
      isPending: false,
      isError: false,
      data: {
        sector: 'Banque',
        consultants: [
          { id: 'c1', full_name: 'Nadia Berger', matched_sectors: ['Banque', 'Assurance'] },
          { id: 'c2', full_name: null, matched_sectors: ['Banque'] },
        ],
      },
    }
    render(<ConsultantsKnowSectorCard sector="Banque" />)
    expect(screen.getByText('Nadia Berger')).toBeInTheDocument()
    expect(screen.getByText(/Banque · Assurance/)).toBeInTheDocument()
    // Nom inconnu ⇒ « non renseigné », jamais une ligne inventée.
    expect(screen.getAllByRole('listitem')).toHaveLength(2)
  })

  it('aucun consultant ⇒ la carte ne se rend pas', () => {
    state.current = { isPending: false, isError: false, data: { sector: 'Banque', consultants: [] } }
    const { container } = render(<ConsultantsKnowSectorCard sector="Banque" />)
    expect(container).toBeEmptyDOMElement()
  })

  it('chargement, panne ou secteur du compte absent ⇒ rien', () => {
    const { container, rerender } = render(<ConsultantsKnowSectorCard sector="Banque" />)
    expect(container).toBeEmptyDOMElement()
    state.current = { isPending: false, isError: true }
    rerender(<ConsultantsKnowSectorCard sector="Banque" />)
    expect(container).toBeEmptyDOMElement()
    rerender(<ConsultantsKnowSectorCard sector={null} />)
    expect(container).toBeEmptyDOMElement()
  })
})
