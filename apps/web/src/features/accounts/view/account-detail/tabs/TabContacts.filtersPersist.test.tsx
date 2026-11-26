import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactElement } from 'react'
import { describe, expect, it, vi } from 'vitest'
import type { Contact } from '@bellum/contracts'
import { ContactEngagementProvider } from '../components/contact-engagement/ContactEngagementProvider'
import { TabContacts } from './TabContacts'

// #3277.2 — le bandeau « rôles manquants » lit la projection 5P (useSession) : neutralisée ici.
vi.mock('@/features/accounts/hooks/useAccountStrategy5P', () => ({
  useAccountStrategy5P: () => ({ data: null }),
}))

/**
 * #2120.77 — « quitter puis revenir sur l'onglet Contacts conserve les filtres ».
 *
 * L'onglet est DÉMONTÉ quand on change de section : un `useState` local repart
 * à zéro. La persistance vit dans l'URL (chez l'appelant) ; l'onglet, lui, doit
 * (1) repartir des filtres qu'on lui rend et (2) annoncer chaque changement pour
 * que l'appelant l'écrive.
 */
vi.mock('@/features/accounts/hooks/useAccountMarketContext', () => ({
  useAccountMarketContext: () => ({ data: null }),
}))
vi.mock('@/features/accounts/hooks/useEnrichAccount', () => ({
  useEnrichContacts: () => ({ mutate: vi.fn(), isPending: false }),
}))
vi.mock('@/features/contacts/hooks/useEnrichContact', () => ({
  useEnrichContact: () => ({ mutate: vi.fn(), isPending: false }),
}))
vi.mock('@/features/credits/hooks/useCredits', () => ({
  useCredits: () => ({ data: { enrichment_credits: 0 } }),
}))
// Né de la fusion (#2628.1) : PriorityPathSection consomme désormais
// useEsnProfile (classement par offre), qui lit useSession — jamais monté
// ici. Mock direct, même convention que PriorityPathSection.test.tsx.
vi.mock('@/features/profile/hooks/useEsnProfile', () => ({
  useEsnProfile: () => ({ data: undefined }),
}))

function contact(id: string, full_name: string, entity: string): Contact {
  return { id, full_name, title: 'DSI', decision_role: null, entity, priority: 1 } as unknown as Contact
}

const CONTACTS = [contact('c1', 'Alice Martin', 'Groupe'), contact('c2', 'Bob Durand', 'Filiale')]

function renderWithQuery(ui: ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <ContactEngagementProvider>{ui}</ContactEngagementProvider>
    </QueryClientProvider>,
  )
}

const baseProps = {
  onCreateContact: () => {},
  onImportCsv: () => {},
  accountId: 'acc-1',
  contacts: CONTACTS,
  accountCompanyName: 'ACME',
  rawAnalysis: {},
}

describe('TabContacts — #2120.77 les filtres se retrouvent au retour', () => {
  it('repart du filtre d’entité rendu par l’appelant (remontage après un changement de section)', () => {
    renderWithQuery(<TabContacts {...baseProps} initialFilters={{ entity: 'Inexistante' }} />)
    // Le filtre est APPLIQUÉ : aucune ligne ne correspond, l'état vide le dit.
    expect(screen.getByRole('button', { name: 'Réinitialiser les filtres' })).toBeInTheDocument()
  })

  it('sait dire NON : sans filtre rendu, la liste n’est pas filtrée', () => {
    renderWithQuery(<TabContacts {...baseProps} />)
    expect(screen.queryByRole('button', { name: 'Réinitialiser les filtres' })).not.toBeInTheDocument()
  })

  it('annonce chaque changement de recherche avec TOUS les filtres, pour que l’URL les écrive', async () => {
    const user = userEvent.setup()
    const onFiltersChange = vi.fn()
    renderWithQuery(<TabContacts {...baseProps} initialFilters={{ level: 'L1' }} onFiltersChange={onFiltersChange} />)
    // Le niveau L1 n'existe pas ici (pas de graphe) : l'état vide s'affiche,
    // et le geste qui annule tout doit aussi être écrit dans l'URL.
    await user.click(screen.getByRole('button', { name: 'Réinitialiser les filtres' }))
    expect(onFiltersChange).toHaveBeenLastCalledWith({ search: '', role: 'all', entity: 'all', level: 'all' })

    await user.type(screen.getByPlaceholderText('Rechercher un contact...'), 'A')
    expect(onFiltersChange).toHaveBeenLastCalledWith({ search: 'A', role: 'all', entity: 'all', level: 'all' })
  })
})
