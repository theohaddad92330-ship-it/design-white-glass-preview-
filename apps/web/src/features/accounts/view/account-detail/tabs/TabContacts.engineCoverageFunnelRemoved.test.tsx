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

/**
 * #2658.1 (décision Louis, QCM du 21/09/2026) — REVIENT DÉLIBÉRÉMENT sur
 * #2552.1 (l'entonnoir « détectés → vérifiés → pertinents → enrichis », né de
 * l'appel bêta client du 17/09/2026) : le bandeau `EngineCoverageFunnelBand`
 * est retiré de l'onglet Contacts d'un dossier de compte.
 *
 * Ce qui TIENT encore : la mesure de couverture (`deriveOrgCoverage`, côté
 * `@bellum/contracts`, gardée par `apps/api/.../demo-org-coverage.spec.ts`)
 * reste calculée côté API — seul l'AFFICHAGE part. Ce test remplace
 * `EngineCoverageFunnelBand.test.tsx` (supprimé avec le composant) : il ne
 * rejoue plus le rendu du bandeau, il prouve son ABSENCE — y compris quand un
 * graphe d'organigramme porte une couverture MESURÉE, pour que ce test rougisse
 * si le bloc revient.
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

// Graphe d'organigramme VALIDE et MESURÉ (mêmes formes que
// `TabOrganigramme.test.tsx`) : si `EngineCoverageFunnelBand` revenait, ce
// graphe lui donnerait exactement de quoi s'afficher.
const RAW_ANALYSIS_WITH_MEASURED_COVERAGE = {
  org: {
    orgGraph: {
      graphVersion: 1,
      entities: [{ id: 'e1', name: 'TF1', type: 'groupe', confidence: 85 }],
      people: [
        {
          id: 'p-marie-dupont',
          fullName: 'Marie Dupont',
          entityId: 'e1',
          identityStatus: 'classified',
          confidence: 90,
        },
      ],
      hierarchyEdges: [],
      influenceEdges: [],
      buyingCommittee: [],
      recommendedPath: [],
      rejectedItems: [],
      coverage: { discovered: 5, deterministicClassified: 5, llmEnriched: 5 },
    },
  },
}

describe('TabContacts — #2658.1 : le bandeau de couverture ENGINE a disparu', () => {
  it('ne porte plus la section « Ce que Bellum a mesuré du corpus de contacts », même avec une couverture mesurée', () => {
    renderWithQuery(
      <TabContacts
        onCreateContact={() => {}}
        onImportCsv={() => {}}
        accountId="acc-1"
        contacts={[contact('c1', { full_name: 'Marie Dupont' })]}
        accountCompanyName="TF1"
        rawAnalysis={RAW_ANALYSIS_WITH_MEASURED_COVERAGE}
      />,
    )

    expect(screen.queryByLabelText(/mesuré du corpus de contacts/i)).not.toBeInTheDocument()
  })
})
