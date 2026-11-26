import { render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactElement } from 'react'
import { describe, expect, it, vi } from 'vitest'
import type { Contact } from '@bellum/contracts'
import { ContactEngagementProvider } from '../components/contact-engagement/ContactEngagementProvider'
import { TabContacts } from './TabContacts'

vi.mock('@/features/accounts/hooks/useAccountStrategy5P', () => ({
  useAccountStrategy5P: () => ({ data: null }),
}))
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
vi.mock('@/components/primitives/AskLaura', () => ({ AskLaura: () => null }))

function contact(id: string, partial: Partial<Contact>): Contact {
  return { id, priority: 1, entity: null, decision_role: null, ...partial } as unknown as Contact
}

function renderWithQuery(ui: ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <ContactEngagementProvider>{ui}</ContactEngagementProvider>
    </QueryClientProvider>,
  )
}

/**
 * #2552 (lot du 07/10) avait remis l'entonnoir détectés → vérifiés →
 * pertinents → enrichis EN TÊTE de l'onglet, en une ligne compacte.
 *
 * #3685.5 (recette prod 09/10, lot H06) — ⚠️ RENVERSEMENT ASSUMÉ ET DATÉ de
 * #2552 : cette ligne, bien que compacte, restait une rangée PERMANENTE de
 * statistiques avant les interlocuteurs — exactement ce que #3685 refuse
 * (« voir les interlocuteurs utiles dès l'arrivée, pas un bloc de
 * statistiques ») et ce que #3685.4 avait déjà tranché pour les filtres actifs
 * (« sans rangées permanentes », `ContactsActiveFilters.tsx`). Elle est
 * retirée de CET onglet ; elle reste rendue ailleurs (`AccountDetailTabContent`,
 * bandeau contextuel des onglets Synthèse/Veille/Projets/Missions, #3709) et
 * son calcul (`buildContactFunnel`/`tallyContactLifecycle`) reste partagé.
 */
describe('TabContacts — plus d’entonnoir permanent en tête de l’onglet (#3685.5)', () => {
  const contacts = [
    contact('c1', { full_name: 'A', lifecycle_state: 'actionnable' }),
    contact('c2', { full_name: 'B', lifecycle_state: 'enrichi' }),
    contact('c3', { full_name: 'C', lifecycle_state: 'qualifie' }),
    contact('c4', { full_name: 'D', lifecycle_state: 'identite_verifiee' }),
    contact('c5', { full_name: 'E', lifecycle_state: 'detecte' }),
  ]

  it('ne rend plus la ligne d’entonnoir, même avec des contacts à tous les stades', () => {
    renderWithQuery(
      <TabContacts
        onCreateContact={() => {}}
        onImportCsv={() => {}}
        accountId="acc-1"
        contacts={contacts}
        accountCompanyName="Arquus"
        rawAnalysis={{}}
      />,
    )

    expect(screen.queryByTestId('contacts-funnel-line')).not.toBeInTheDocument()
    expect(screen.queryByText('5 détectés')).not.toBeInTheDocument()
    // Le grand bandeau retiré par #3685.1 ne revient pas non plus.
    expect(screen.queryByText('Du contact détecté au contact prioritaire')).not.toBeInTheDocument()
  })

  it('aucun contact ⇒ toujours aucune ligne d’entonnoir', () => {
    renderWithQuery(
      <TabContacts
        onCreateContact={() => {}}
        onImportCsv={() => {}}
        accountId="acc-1"
        contacts={[]}
        accountCompanyName="Arquus"
        rawAnalysis={{}}
      />,
    )
    expect(screen.queryByTestId('contacts-funnel-line')).not.toBeInTheDocument()
  })
})

/**
 * #3742 (recette 07/10, Arquus) — « impossible de croiser lieu et contacts ».
 * Le filtre Localisation, repris de l'URL, ne garde que les contacts du lieu
 * et le NOMME en clair dans la ligne des filtres actifs.
 */
describe('TabContacts — filtre Localisation (#3742)', () => {
  const contacts = [
    contact('c1', { full_name: 'Alice', location: '58180 Garchizy, France' }),
    contact('c2', { full_name: 'Bruno', location: 'Dijon, Bourgogne-Franche-Comté, France' }),
    contact('c3', { full_name: 'Carla', location: 'Madrid, Spain' }),
    contact('c4', { full_name: 'Denis', location: null }),
  ]

  it('une région choisie garde ses seuls contacts et se lit en toutes lettres', () => {
    renderWithQuery(
      <TabContacts
        onCreateContact={() => {}}
        onImportCsv={() => {}}
        accountId="acc-1"
        contacts={contacts}
        accountCompanyName="Arquus"
        rawAnalysis={{}}
        initialFilters={{ place: 'region:Bourgogne-Franche-Comté' }}
      />,
    )
    expect(screen.getByText('2 sur 4 contacts')).toBeInTheDocument()
    expect(screen.getByText('Filtres : lieu Bourgogne-Franche-Comté')).toBeInTheDocument()
  })
})
