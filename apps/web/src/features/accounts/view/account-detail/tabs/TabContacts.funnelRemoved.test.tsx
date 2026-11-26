import { render, screen } from '@testing-library/react'
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

// Mêmes stubs que les autres tests de l'onglet : crédits + mutations d'enrichissement
// n'ont rien à voir avec le funnel.
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
// #2126.23 — l'état vide propose « Demander à Laura », un lien du routeur :
// ce test ne monte pas de routeur, et ne porte pas sur Laura.
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
 * #3685.1 — le grand bandeau « Du contact détecté au contact prioritaire »
 * (`ContactsFunnelBand`) est RETIRÉ du dossier Compte : les interlocuteurs
 * viennent d'abord. Il ne revient ni sous un autre titre, ni en quatre cartes.
 * Ce qui tient : le composant reste monté sur la liste globale /contacts
 * (ticket 051, `ContactContent.tsx`), le calcul `tallyContactLifecycle` reste
 * exporté, et le chemin prioritaire + la liste restent rendus (#3685.2-.3).
 * Remplace `TabContacts.funnel.test.tsx` (p46), qui prouvait le contraire.
 */
describe('TabContacts — #3685.1 : plus de bandeau d’entonnoir sur le dossier', () => {
  const contacts = [
    contact('c1', { full_name: 'Marie Dupont', title: 'DSI', decision_role: 'technical', email: 'marie@tf1.fr' }),
    contact('c2', { full_name: 'Paul Martin', title: 'RSSI', decision_role: 'technical', email: null }),
    contact('c3', { full_name: 'Karim', title: null, email: null }),
  ]

  it('ne rend ni le titre de l’entonnoir ni son périmètre, et garde les contacts visibles', () => {
    renderWithQuery(
      <TabContacts
        onCreateContact={() => {}}
        onImportCsv={() => {}}
        accountId="acc-1"
        contacts={contacts}
        accountCompanyName="TF1"
        rawAnalysis={{}}
      />,
    )

    expect(screen.queryByText('Du contact détecté au contact prioritaire')).not.toBeInTheDocument()
    expect(screen.queryByText('Dossier TF1 — contacts de cette analyse')).not.toBeInTheDocument()
    expect(screen.queryByLabelText(/Du contact détecté/i)).not.toBeInTheDocument()
    // La liste (recherche + regroupement) est rendue à la place : les contacts viennent d'abord.
    expect(screen.getByPlaceholderText('Rechercher un contact...')).toBeInTheDocument()
  })

  it('aucun contact ⇒ aucun entonnoir non plus', () => {
    renderWithQuery(
      <TabContacts
        onCreateContact={() => {}}
        onImportCsv={() => {}}
        accountId="acc-1"
        contacts={[]}
        accountCompanyName="TF1"
        rawAnalysis={{}}
      />,
    )

    expect(screen.queryByText('Du contact détecté au contact prioritaire')).not.toBeInTheDocument()
    expect(screen.queryByText('Dossier TF1 — contacts de cette analyse')).not.toBeInTheDocument()
  })
})
