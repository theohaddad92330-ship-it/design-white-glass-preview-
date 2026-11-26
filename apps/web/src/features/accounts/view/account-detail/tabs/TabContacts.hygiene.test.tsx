import { render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactElement } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Contact } from '@bellum/contracts'
import type { AccountHygieneByAccount } from '@/features/accounts/api'
import { ContactEngagementProvider } from '../components/contact-engagement/ContactEngagementProvider'
import { TabContacts } from './TabContacts'

// #3277.2 — le bandeau « rôles manquants » lit la projection 5P (useSession) : neutralisée ici.
vi.mock('@/features/accounts/hooks/useAccountStrategy5P', () => ({
  useAccountStrategy5P: () => ({ data: null }),
}))

/**
 * LE CONTRÔLE EST-IL BRANCHÉ SUR L'ONGLET OÙ IL SE RÉPARE ?
 *
 * « Contacts sans adresse » était calculé et ne s'affichait qu'au cockpit —
 * l'endroit exact où la personne qui pourrait le corriger n'est pas. Ce test
 * prouve les deux moitiés : la note apparaît sur le dossier du compte concerné,
 * ET son bouton déclenche vraiment la recherche d'adresses. Une note sans geste
 * est du bruit.
 */

const hygiene = vi.fn()
const enrichBatch = vi.fn()

// #1609 — l'onglet monte désormais les pistes de recherche, qui lisent le
// contexte marché. Le corpus est neutralisé ici : ces tests portent sur les
// contacts, et une requête réelle les rendrait dépendants d'un référentiel.
vi.mock('@/features/accounts/hooks/useAccountMarketContext', () => ({
  useAccountMarketContext: () => ({ data: null }),
}))

vi.mock('@/features/accounts/api', async importOriginal => {
  const actual = await importOriginal<typeof import('@/features/accounts/api')>()
  return { ...actual, accountsApi: { ...actual.accountsApi, hygiene: () => hygiene() } }
})
vi.mock('@/features/accounts/hooks/useEnrichAccount', () => ({
  useEnrichContacts: () => ({ mutate: enrichBatch, isPending: false }),
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

function contact(id: string, partial: Partial<Contact>): Contact {
  return { id, priority: 1, entity: null, decision_role: null, ...partial } as unknown as Contact
}

function answer(over: Partial<AccountHygieneByAccount> = {}): AccountHygieneByAccount {
  return {
    withoutNextAction: { ids: [], truncated: false },
    contactsWithoutEmail: { byAccount: {}, truncated: false },
    ...over,
  }
}

/** Un client NEUF par rendu : un cache partagé ferait relire au second test la
 *  réponse du premier, et le test deviendrait l'écho de son voisin. */
function draw(ui: ReactElement) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } },
  })
  return render(
    <QueryClientProvider client={client}>
      <ContactEngagementProvider>{ui}</ContactEngagementProvider>
    </QueryClientProvider>,
  )
}

const CONTACTS = [
  contact('c1', { full_name: 'Marie Dupont', title: 'DSI', email: 'marie@tf1.fr' }),
  contact('c2', { full_name: 'Paul Martin', title: 'RSSI', email: null }),
]

describe('TabContacts — le contrôle « contacts sans adresse », posé sur le dossier', () => {
  beforeEach(() => {
    hygiene.mockReset()
    enrichBatch.mockReset()
  })

  // #3631 retire la note « N des M contacts de ce compte n'ont pas d'adresse »
  // (`AccountContactsEmailNotice`) de la fiche compte, délibérément (Louis
  // 05/10). Ce test affirmait sa présence ; il prouve désormais son ABSENCE,
  // même quand le serveur compte des contacts sans adresse sur CE compte. La
  // recherche d'adresses reste atteignable (`ResearchExpansionCallout`, et la
  // note de collecte périmée quand elle s'applique).
  it('#3631 — ne pose plus la note, même quand des contacts de CE compte n’ont pas d’adresse', async () => {
    hygiene.mockResolvedValue(
      answer({ contactsWithoutEmail: { byAccount: { 'acc-1': { count: 1, total: 2 } }, truncated: false } }),
    )

    draw(
      <TabContacts
        onCreateContact={() => {}}
        onImportCsv={() => {}}
        accountId="acc-1"
        contacts={CONTACTS}
        accountCompanyName="TF1"
        rawAnalysis={{}}
      />,
    )

    await screen.findAllByText('Marie Dupont')
    await new Promise(resolve => setTimeout(resolve, 0))
    expect(screen.queryByText(/1 des 2/)).toBeNull()
    expect(enrichBatch).not.toHaveBeenCalled()
  })

  it('reste muet quand tous les contacts de CE compte ont une adresse', async () => {
    hygiene.mockResolvedValue(
      answer({ contactsWithoutEmail: { byAccount: { 'autre-compte': { count: 4, total: 9 } }, truncated: false } }),
    )

    draw(
      <TabContacts
        onCreateContact={() => {}}
        onImportCsv={() => {}}
        accountId="acc-1"
        contacts={CONTACTS}
        accountCompanyName="TF1"
        rawAnalysis={{}}
      />,
    )

    await screen.findAllByText('Marie Dupont')
    expect(screen.queryByText(/des 9/)).toBeNull()
  })
})
