import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactElement } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Contact } from '@bellum/contracts'
import { i18n } from '@/i18n'
import { ContactEngagementProvider } from '../components/contact-engagement/ContactEngagementProvider'
import { TabContacts } from './TabContacts'

// #3277.2 — le bandeau « rôles manquants » lit la projection 5P (useSession) : neutralisée ici.
vi.mock('@/features/accounts/hooks/useAccountStrategy5P', () => ({
  useAccountStrategy5P: () => ({ data: null }),
}))

/**
 * « Aucun contact ne correspond aux filtres » — un titre NU.
 *
 * Ni description ni geste : l'écran constatait le vide qu'il venait lui-même de
 * produire, et laissait retrouver le champ de recherche et le sélecteur de rôle
 * pour les défaire un par un. Les deux filtres sont portés par cet onglet — la
 * porte était déjà dans la pièce.
 */
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
// #2126.23 — l'état vide propose « Demander à Laura », un lien du routeur :
// ce test ne monte pas de routeur, et ne porte pas sur Laura.
vi.mock('@/components/primitives/AskLaura', () => ({ AskLaura: () => null }))
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

function renderWithQuery(ui: ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <ContactEngagementProvider>{ui}</ContactEngagementProvider>
    </QueryClientProvider>,
  )
}

describe('TabContacts — le vide fabriqué par un filtre porte le geste qui le défait', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('fr')
  })

  it('remet les filtres à zéro au clic et rend la liste', async () => {
    const user = userEvent.setup()
    renderWithQuery(
      <TabContacts
        onCreateContact={() => {}}
        onImportCsv={() => {}}
        accountId="acc-1"
        contacts={CONTACTS}
        accountCompanyName="ACME"
        rawAnalysis={{}}
        initialSearch="zz"
      />,
    )

    expect(screen.getByText('Aucun contact ne correspond aux filtres')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Réinitialiser les filtres' }))

    expect(screen.queryByText('Aucun contact ne correspond aux filtres')).not.toBeInTheDocument()
    expect(screen.getByPlaceholderText('Rechercher un contact...')).toHaveValue('')
  })

  it('ne pose aucun geste quand le dossier lui-même est vide — l’état vide voisin porte déjà les siens', () => {
    renderWithQuery(
      <TabContacts
        onCreateContact={() => {}}
        onImportCsv={() => {}}
        accountId="acc-1"
        contacts={[]}
        accountCompanyName="ACME"
        rawAnalysis={{}}
      />,
    )

    expect(screen.queryByRole('button', { name: 'Réinitialiser les filtres' })).not.toBeInTheDocument()
  })

  it('#3685.4 — une ligne « N sur M » nomme les filtres actifs ; aucune sans filtre', async () => {
    const user = userEvent.setup()
    const props = {
      onCreateContact: () => {},
      onImportCsv: () => {},
      accountId: 'acc-1',
      contacts: CONTACTS,
      accountCompanyName: 'ACME',
      rawAnalysis: {},
    }
    const { unmount } = renderWithQuery(<TabContacts {...props} />)
    expect(screen.queryByText(/sur 2 contacts/)).not.toBeInTheDocument()
    unmount()

    renderWithQuery(<TabContacts {...props} initialSearch="Alice" />)
    expect(screen.getByText('1 sur 2 contacts')).toBeInTheDocument()
    expect(screen.getByText(/recherche « Alice »/)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Tout effacer' }))
    expect(screen.queryByText(/sur 2 contacts/)).not.toBeInTheDocument()
  })
})
