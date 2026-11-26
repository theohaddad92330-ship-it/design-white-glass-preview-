import { screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { renderWithRouter } from '@/test-utils/renderWithRouter'
import { FirstSelectionCard } from './FirstSelectionCard'

/**
 * #2626.2 — « montrer une première sélection de comptes en fin de Temps 1 » :
 * la carte doit dire QUELQUE CHOSE de vrai dès que la découverte a trouvé des
 * comptes, et ne JAMAIS afficher un texte de type « 0 compte trouvé » quand
 * elle est vide ou en échec (GA-18/GA-19 : une valeur absente ne s'affiche
 * jamais « 0 »).
 */
const { mockUseFirstSelection } = vi.hoisted(() => ({ mockUseFirstSelection: vi.fn() }))

vi.mock('../hooks/useOnboarding', () => ({ useFirstSelection: () => mockUseFirstSelection() }))

describe('FirstSelectionCard — #2626.2', () => {
  it('affiche les comptes trouvés, avec secteur et ville', async () => {
    mockUseFirstSelection.mockReturnValue({
      isLoading: false,
      data: {
        suggestions: [
          { name: 'BPCE', siren: '493455042', city: 'Paris', sector: 'Banque de détail & Banque privée' },
          { name: 'Société Générale', siren: '552120222', city: 'Paris', sector: 'Banque de détail & Banque privée' },
        ],
      },
    })

    renderWithRouter(<FirstSelectionCard />)

    expect(await screen.findByText('BPCE')).toBeInTheDocument()
    expect(screen.getByText('Société Générale')).toBeInTheDocument()
    expect(screen.getAllByText(/Banque de détail & Banque privée/)).toHaveLength(2)
  })

  it('ne rend rien — jamais « 0 compte » — quand la découverte est vide', () => {
    mockUseFirstSelection.mockReturnValue({ isLoading: false, data: { suggestions: [] } })

    const { container } = renderWithRouter(<FirstSelectionCard />)

    expect(container).toBeEmptyDOMElement()
    expect(screen.queryByText(/0/)).not.toBeInTheDocument()
  })

  it('ne rend rien tant que la recherche est en cours', async () => {
    mockUseFirstSelection.mockReturnValue({ isLoading: true, data: undefined })

    renderWithRouter(<FirstSelectionCard />)

    expect(await screen.findByTestId('first-selection-loading')).toBeInTheDocument()
    expect(screen.queryByTestId('first-selection-card')).not.toBeInTheDocument()
  })
})
