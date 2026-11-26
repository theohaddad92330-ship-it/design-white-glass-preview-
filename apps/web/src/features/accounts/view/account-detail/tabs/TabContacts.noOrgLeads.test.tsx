import { screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { Contact } from '@bellum/contracts'
import { renderWithRouter } from '@/test-utils/renderWithRouter'
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

const hygiene = vi.fn().mockResolvedValue({
  withoutNextAction: { ids: [], truncated: false },
  contactsWithoutEmail: { byAccount: {}, truncated: false },
})
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

// #4509 (décision Louis 24/10/2026) — revient sur #4465 : la section « N personnes de l'organigramme, sans fiche »
// quitte l'onglet Contacts. Ces personnes se lisent, et se créent en fiche, depuis l'onglet Organigramme. La section
// « citées dans un signal » RESTE : c'est la seule autre provenance de pistes, et elle n'est pas visée.
const RAW = {
  org: {
    orgGraph: {
      entities: [],
      people: [
        { id: 'p-jean-dupont', fullName: 'Jean Dupont', title: 'DSI', identityStatus: 'confirmed', confidence: 'high' },
        { id: 'p-marie-curie', fullName: 'Marie Curie', title: 'DAF', identityStatus: 'confirmed', confidence: 'high' },
      ],
    },
  },
}

function renderTab(rawAnalysis: Record<string, unknown>, contacts: Contact[] = []) {
  return renderWithRouter(
    <TabContacts
      onCreateContact={() => {}}
      onImportCsv={() => {}}
      accountId="acc-cafpi"
      contacts={contacts}
      accountCompanyName="CAFPI"
      rawAnalysis={rawAnalysis}
    />,
  )
}

describe('TabContacts — plus de pistes d’organigramme (#4509)', () => {
  it('NON : des personnes de graphe sans fiche ne font plus aucune section ni aucune ligne', async () => {
    renderTab(RAW)
    await screen.findByText(/Aucun contact dans ce dossier/)
    expect(screen.queryByTestId('org-leads')).toBeNull()
    expect(screen.queryByText(/personnes? de l’organigramme/)).toBeNull()
    expect(screen.queryByText('Jean Dupont')).toBeNull()
  })

  it('la section « citées dans un signal » reste, avec son geste « Ajouter et enrichir »', async () => {
    renderTab({ ...RAW, peopleMentioned: [{ name: 'Paul Martin', title: 'Directeur achats' }] })
    const section = await screen.findByTestId('signal-leads')
    expect(section).toHaveTextContent('Paul Martin')
    expect(section).toHaveTextContent('1 personne citée dans un signal')
    expect(within(section).getByRole('button', { name: /Ajouter et enrichir/ })).toBeInTheDocument()
    // Jamais un mélange : les personnes du graphe n'y entrent pas.
    expect(section).not.toHaveTextContent('Jean Dupont')
  })
})
