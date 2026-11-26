import { render, screen, within } from '@testing-library/react'
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
 * #2120.71-75 — la sélection multiple de l'onglet Contacts du dossier : on
 * coche des lignes, la barre des gestes de lot apparaît. Avant, aucune case à
 * cocher n'existait sur cet onglet.
 */
vi.mock('@/features/accounts/hooks/useAccountMarketContext', () => ({
  useAccountMarketContext: () => ({ data: null }),
}))
vi.mock('@/features/accounts/hooks/useEnrichAccount', () => ({
  useEnrichContacts: () => ({ mutate: vi.fn(), isPending: false }),
}))
vi.mock('@/features/contacts/hooks/useEnrichContact', () => ({
  useEnrichContact: () => ({ mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false }),
}))
vi.mock('@/features/credits/hooks/useCredits', () => ({
  useCredits: () => ({ data: { enrichment_credits: 0 } }),
}))
vi.mock('@/features/chat/hooks/useWorkspaceMembers', () => ({
  useWorkspaceMembers: () => ({ data: [] }),
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

describe('TabContacts — Recette 21/10 A.1 groupe à qualifier replié', () => {
  it('les classés sont ouverts, le groupe à qualifier replié ; « Tout déplier » l’ouvre aussi', async () => {
    const user = userEvent.setup()
    const classed = { ...contact('c3', 'Claire Dupont', 'Groupe'), decision_role: 'economic' } as unknown as Contact
    renderWithQuery(<TabContacts {...baseProps} contacts={[classed, ...CONTACTS]} />)
    expect(screen.getByRole('checkbox', { name: 'Sélectionner Claire Dupont' })).toBeInTheDocument()
    expect(screen.queryByRole('checkbox', { name: 'Sélectionner Alice Martin' })).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Tout déplier' }))
    expect(screen.getByRole('checkbox', { name: 'Sélectionner Alice Martin' })).toBeInTheDocument()
  })
})

describe('TabContacts — #2120.71-75 sélection multiple', () => {
  it('sait dire NON : sans case cochée, aucune barre de lot', async () => {
    const user = userEvent.setup()
    renderWithQuery(<TabContacts {...baseProps} />)
    await user.click(screen.getByRole('button', { name: 'Tout déplier' }))
    expect(screen.getByRole('checkbox', { name: 'Sélectionner Alice Martin' })).not.toBeChecked()
    expect(screen.queryByRole('region', { name: 'Actions sur les contacts sélectionnés' })).not.toBeInTheDocument()
  })

  it('cocher une ligne fait apparaître la barre, et « tout sélectionner » prend les contacts retenus par les filtres', async () => {
    const user = userEvent.setup()
    const onContactClick = vi.fn()
    renderWithQuery(<TabContacts {...baseProps} onContactClick={onContactClick} />)
    await user.click(screen.getByRole('button', { name: 'Tout déplier' }))

    await user.click(screen.getByRole('checkbox', { name: 'Sélectionner Alice Martin' }))
    // Cocher ne vaut pas ouvrir la fiche.
    expect(onContactClick).not.toHaveBeenCalled()
    const bar = screen.getByRole('region', { name: 'Actions sur les contacts sélectionnés' })
    expect(within(bar).getByText('1 contact sélectionné')).toBeInTheDocument()

    await user.click(within(bar).getByRole('button', { name: 'Sélectionner les 2 contacts retenus par les filtres' }))
    expect(within(bar).getByText('2 contacts sélectionnés')).toBeInTheDocument()
    expect(screen.getByRole('checkbox', { name: 'Sélectionner Bob Durand' })).toBeChecked()

    await user.click(within(bar).getByRole('button', { name: 'Effacer la sélection' }))
    expect(screen.queryByRole('region', { name: 'Actions sur les contacts sélectionnés' })).not.toBeInTheDocument()
  })
})
