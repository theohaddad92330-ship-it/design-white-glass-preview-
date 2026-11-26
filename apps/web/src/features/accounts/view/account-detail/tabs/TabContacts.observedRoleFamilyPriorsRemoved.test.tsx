import { render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactElement } from 'react'
import { describe, expect, it, vi } from 'vitest'
import type { AccountMarketContext, Contact } from '@bellum/contracts'
import { ContactEngagementProvider } from '../components/contact-engagement/ContactEngagementProvider'
import { useAccountMarketContext } from '@/features/accounts/hooks/useAccountMarketContext'
import { TabContacts } from './TabContacts'

// #3277.2 — le bandeau « rôles manquants » lit la projection 5P (useSession) : neutralisée ici.
vi.mock('@/features/accounts/hooks/useAccountStrategy5P', () => ({
  useAccountStrategy5P: () => ({ data: null }),
}))

/**
 * #2659.1 (décision Louis, QCM du 21/09/2026) — REVIENT DÉLIBÉRÉMENT sur #1609
 * (les familles de rôles observées, comme piste de recherche) et son correctif
 * #1755 (le seau résiduel) : la carte `ObservedRoleFamilyPriors` est retirée de
 * l'onglet Contacts d'un dossier de compte.
 *
 * Ce qui TIENT encore : `role_families` reste calculé et servi côté API
 * (`accounts.controller.ts`, champ `role_families`) — d'autres écrans le
 * lisent toujours (`TabSignal`, `AccountMarketMemoryCard`, #1610) via
 * `observedRoleFamilyLabels`. Seul CET affichage, dans Contacts, part.
 *
 * Ce test remplace `ObservedRoleFamilyPriors.test.tsx` (supprimé avec le
 * composant) : il ne rejoue plus son rendu, il prouve son ABSENCE — y compris
 * quand la mémoire marché retourne des familles, pour que ce test rougisse si
 * le bloc revient.
 */

vi.mock('@/features/accounts/hooks/useAccountMarketContext', () => ({
  useAccountMarketContext: vi.fn(() => ({ data: null })),
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
// ici. Mock direct, même convention que TabContacts.funnel.test.tsx.
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

describe('TabContacts — #2659.1 : les familles de rôles observées ont disparu', () => {
  it('ne porte plus la carte des familles de rôles observées, même quand la mémoire marché en retourne', () => {
    vi.mocked(useAccountMarketContext).mockReturnValue({
      data: { role_families: [{ family: 'Data / IA', persons: 4 }] } as AccountMarketContext,
      isPending: false,
      isError: false,
    } as unknown as ReturnType<typeof useAccountMarketContext>)

    renderWithQuery(
      <TabContacts
        onCreateContact={() => {}}
        onImportCsv={() => {}}
        accountId="acc-1"
        contacts={[contact('c1', { full_name: 'Marie Dupont' })]}
        accountCompanyName="TF1"
        rawAnalysis={{}}
      />,
    )

    // La famille observée, et le titre de la carte (namespace accountOrg),
    // n'apparaissent plus nulle part dans l'onglet.
    expect(screen.queryByText('Data / IA')).not.toBeInTheDocument()
    expect(screen.queryByText('Pistes de recherche')).not.toBeInTheDocument()
  })
})
