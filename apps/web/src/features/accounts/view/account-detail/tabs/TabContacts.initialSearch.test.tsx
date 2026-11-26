import { render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactElement } from 'react'
import { describe, expect, it, vi } from 'vitest'
import type { Contact } from '@bellum/contracts'
import { ContactEngagementProvider } from '../components/contact-engagement/ContactEngagementProvider'
import { filterContacts } from './contacts/contactGrouping'
import { TabContacts } from './TabContacts'

// #3277.2 — le bandeau « rôles manquants » lit la projection 5P (useSession) : neutralisée ici.
vi.mock('@/features/accounts/hooks/useAccountStrategy5P', () => ({
  useAccountStrategy5P: () => ({ data: null }),
}))

// The contacts tab pulls credits + enrichment mutations; stub them so the test
// stays focused on the « zone blanche → contacts search » handoff.
// #1609 — l'onglet monte désormais les pistes de recherche, qui lisent le
// contexte marché. Le corpus est neutralisé ici : ces tests portent sur les
// contacts, et une requête réelle les rendrait dépendants d'un référentiel.
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

function contact(id: string, full_name: string, title: string): Contact {
  return { id, full_name, title, decision_role: null, entity: null, priority: 1 } as unknown as Contact
}

const CONTACTS = [contact('c1', 'Alice Martin', 'DSI Groupe'), contact('c2', 'Bob Durand', 'Acheteur IT')]

/** The contacts tab tracks actions through react-query — give it a client. */
function renderWithQuery(ui: ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <ContactEngagementProvider>{ui}</ContactEngagementProvider>
    </QueryClientProvider>,
  )
}

describe('TabContacts — initialSearch (coverage gap handoff)', () => {
  const noFilters = { role: 'all', entity: 'all', level: 'all' }
  const noLevel = () => null

  it('filters the contact list down to the handed-over title', () => {
    // `filterContacts` is what the seeded query drives — assert the derivation
    // directly so the test does not depend on the collapsed/expanded group UI.
    expect(filterContacts(CONTACTS, 'DSI', noFilters, noLevel).map(c => c.full_name)).toEqual(['Alice Martin'])
  })

  it('seeds the search box with the incoming query', () => {
    renderWithQuery(
      <TabContacts
        onCreateContact={() => {}}
        onImportCsv={() => {}}
        accountId="acc-1"
        contacts={CONTACTS}
        accountCompanyName="ACME"
        rawAnalysis={{}}
        initialSearch="DSI"
      />,
    )

    // The query lands in the account's EXISTING contacts search box.
    expect(screen.getByDisplayValue('DSI')).toBeInTheDocument()
  })

  it('lists everyone when no query is handed over (default behaviour unchanged)', () => {
    renderWithQuery(
      <TabContacts
        onCreateContact={() => {}}
        onImportCsv={() => {}}
        accountId="acc-1"
        contacts={CONTACTS}
        accountCompanyName="ACME"
        rawAnalysis={{}}
      />,
    )

    expect(screen.queryByDisplayValue('DSI')).not.toBeInTheDocument()
    expect(filterContacts(CONTACTS, '', noFilters, noLevel)).toHaveLength(2)
  })
})
