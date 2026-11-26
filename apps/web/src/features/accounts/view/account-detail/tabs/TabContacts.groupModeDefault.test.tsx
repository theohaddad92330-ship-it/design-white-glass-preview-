import { render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactElement } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Contact } from '@bellum/contracts'
import { ContactEngagementProvider } from '../components/contact-engagement/ContactEngagementProvider'
import { CONTACT_GROUP_MODE_STORAGE_KEY } from './contacts/contact-group-mode'
import { TabContacts } from './TabContacts'

// #3277.2 — le bandeau « rôles manquants » lit la projection 5P (useSession) : neutralisée ici.
vi.mock('@/features/accounts/hooks/useAccountStrategy5P', () => ({
  useAccountStrategy5P: () => ({ data: null }),
}))

/**
 * #3153 (retour bêta) — « par défaut, affiche les contacts par type de poste ».
 *
 * Le regroupement par défaut de l'onglet Contacts passe d'« entité » à
 * « persona » (le type de poste). Un choix déjà mémorisé (`localStorage`,
 * `contact-group-mode.ts`) reste respecté — seul un poste qui n'a jamais
 * choisi bascule sur le nouveau défaut.
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

describe('TabContacts — #3153 le regroupement par défaut devient « persona »', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('sans choix mémorisé, regroupe PAR PERSONA — plus par entité', () => {
    renderWithQuery(<TabContacts {...baseProps} />)
    expect(screen.getByText('Contacts par persona')).toBeInTheDocument()
    expect(screen.queryByText('Contacts par entité')).not.toBeInTheDocument()
  })

  it('un choix explicite déjà mémorisé (« entité ») est respecté', () => {
    localStorage.setItem(CONTACT_GROUP_MODE_STORAGE_KEY, 'entity')
    renderWithQuery(<TabContacts {...baseProps} />)
    expect(screen.getByText('Contacts par entité')).toBeInTheDocument()
  })

  it('#3154 — une valeur mémorisée « technology » (mode retiré) retombe sur le défaut « persona »', () => {
    localStorage.setItem(CONTACT_GROUP_MODE_STORAGE_KEY, 'technology')
    renderWithQuery(<TabContacts {...baseProps} />)
    expect(screen.getByText('Contacts par persona')).toBeInTheDocument()
  })

  it('#3154 — le mode « Par technologie » a disparu des onglets de regroupement', () => {
    renderWithQuery(<TabContacts {...baseProps} />)
    expect(screen.queryByRole('button', { name: 'Par technologie' })).not.toBeInTheDocument()
  })
})
