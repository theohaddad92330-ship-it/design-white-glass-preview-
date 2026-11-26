import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

/** #3246 (R17 15/10) — « Organisation de la décision » et « Pour comparer… » d'une perte : jamais un bloc vide. */
const contacts = vi.fn()
const similar = vi.fn()
vi.mock('../hooks/useProjectContacts', () => ({ useProjectContacts: () => contacts() }))
vi.mock('../hooks/useSimilarProjects', () => ({ useSimilarProjects: () => similar() }))

const { LostDealDecisionOrganisation, LostDealComparableLosses } = await import('./LostDealDecisionOrganisation')

const contact = (over: Record<string, unknown>) => ({
  contact_id: 'c1',
  full_name: 'Alice Martin',
  title: null,
  email: null,
  role: 'decideur',
  created_at: '2026-10-01',
  ...over,
})

beforeEach(() => {
  contacts.mockReset()
  similar.mockReset()
})

describe('LostDealDecisionOrganisation', () => {
  it('nomme les acteurs, leur rôle, le décideur et ce qui manque', () => {
    contacts.mockReturnValue({
      data: [contact({}), contact({ contact_id: 'c2', full_name: 'Bob Durand', role: 'prescripteur' })],
      isLoading: false,
      isError: false,
    })
    render(<LostDealDecisionOrganisation projectId="p-1" />)
    expect(screen.getByText('Organisation de la décision')).toBeTruthy()
    expect(screen.getAllByText(/Alice Martin/).length).toBeGreaterThan(0)
    expect(screen.getByTestId('decision-decider')).toHaveTextContent('Alice Martin')
    expect(screen.getByTestId('decision-missing')).toHaveTextContent('Sponsor')
    expect(screen.getByTestId('decision-missing')).toHaveTextContent('Acheteur')
    expect(screen.getByTestId('decision-missing')).not.toHaveTextContent('Décideur')
  })

  it('aucun acteur ⇒ une phrase « non renseigné », jamais un bloc vide', () => {
    contacts.mockReturnValue({ data: [], isLoading: false, isError: false })
    render(<LostDealDecisionOrganisation projectId="p-1" />)
    expect(screen.getByText('Organisation de la décision')).toBeTruthy()
    expect(screen.getByTestId('decision-empty')).toHaveTextContent('non renseigné')
    expect(screen.getByTestId('decision-decider')).toHaveTextContent('non renseigné')
  })

  it('lecture en erreur ⇒ une phrase, pas un silence', () => {
    contacts.mockReturnValue({ data: undefined, isLoading: false, isError: true })
    render(<LostDealDecisionOrganisation projectId="p-1" />)
    expect(screen.getByTestId('decision-error')).toBeTruthy()
  })
})

describe('LostDealComparableLosses', () => {
  it('ne liste que les pertes de l’espace', () => {
    similar.mockReturnValue({
      data: {
        matches: [
          { id: 'a', stage: 'lost', company_name: 'Acme', label: 'Infogérance', shared_terms: ['infogérance'] },
          { id: 'b', stage: 'proposal', company_name: 'Beta', label: 'Cloud', shared_terms: [] },
        ],
      },
      isPending: false,
      isError: false,
    })
    render(<LostDealComparableLosses projectId="p-1" />)
    expect(screen.getByText(/Acme/)).toBeTruthy()
    expect(screen.queryByText(/Beta/)).toBeNull()
  })

  it('aucune perte comparable ⇒ une phrase', () => {
    similar.mockReturnValue({ data: { matches: [] }, isPending: false, isError: false })
    render(<LostDealComparableLosses projectId="p-1" />)
    expect(screen.getByTestId('comparable-empty')).toHaveTextContent('Aucune perte comparable')
  })
})
