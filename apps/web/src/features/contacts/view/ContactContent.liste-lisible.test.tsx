import { screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { renderWithRouter } from '@/test-utils/renderWithRouter'
import type { GlobalContact } from '@/features/contacts/hooks/useContacts'
import { ContactContent } from './ContactContent'

vi.mock('@/features/accounts/view/account-detail/components/contact-engagement/ContactEngagementContext', () => ({
  useContactEngagement: () => ({ openEngagement: vi.fn() }),
  useOptionalContactEngagement: () => ({ openEngagement: vi.fn() }),
}))

const row = (n: number): GlobalContact => ({
  id: `c${n}`,
  account_id: 'a1',
  full_name: `Contact ${n}`,
  title: 'DSI',
  entity: null,
  decision_role: null,
  priority: 5,
  email: null,
  phone: null,
  linkedin_url: null,
  why_contact: null,
  user_status: 'new',
  source: 'apollo',
  created_at: '2026-07-01T10:00:00.000Z',
  updated_at: '2026-07-10T10:00:00.000Z',
  company_name: 'Corp',
})

const props = {
  contacts: [1, 2, 3].map(row),
  totalContacts: 3,
  lifecycleTally: undefined,
  stateFilter: undefined,
  onLifecycleFilterChange: () => {},
  loading: false,
  query: '',
  onQueryChange: () => {},
  activeFilters: [],
  onFiltersChange: () => {},
  onAddFilter: () => {},
  unassignedFilter: undefined,
  onScopeChange: () => {},
  onClearFilters: () => {},
  isFilterActive: false,
  onFiltersOpenChange: () => {},
}

// #3933 (retour bêta Louis 08/10/2026) — remplace les deux `describe` #3713.7
// ci-dessus, qui prouvaient le comportement (repliable) d'un bandeau d'entonnoir
// désormais SUPPRIMÉ de /contacts. Même retrait que #3685.1 sur le dossier Compte.
describe('#3933 — plus de bandeau d’entonnoir sur /contacts', () => {
  it('ni replié ni déplié : le bandeau ne rend plus rien, panneau Filtres fermé ou ouvert', async () => {
    const tally = {
      detecte: 3,
      identite_verifiee: 0,
      qualifie: 0,
      enrichi: 0,
      actionnable: 0,
      historique: 0,
      rejete: 0,
    }
    renderWithRouter(<ContactContent {...props} lifecycleTally={tally} filtersOpen />)
    // Théo c1.R8 — ouverte, la modale de filtres rend le reste de la page inerte (`hidden: true`).
    expect(await screen.findByRole('checkbox', { name: /tout sélectionner/i, hidden: true })).toBeInTheDocument()
    expect(screen.queryByTestId('funnel-cumulative-note')).not.toBeInTheDocument()
    expect(screen.queryByText('Du contact détecté au contact prioritaire')).not.toBeInTheDocument()
  })
})

describe('#3713.6 — aucun « Dernier contact » qui soit une date d’import ou de mise à jour', () => {
  it('le tableau ne porte aucune colonne « Dernier contact »', async () => {
    renderWithRouter(<ContactContent {...props} filtersOpen={false} />)
    await screen.findByRole('checkbox', { name: /tout sélectionner/i })
    expect(screen.queryByRole('columnheader', { name: /dernier contact/i })).not.toBeInTheDocument()
    expect(screen.queryByText(/dernier contact/i)).not.toBeInTheDocument()
  })
})
