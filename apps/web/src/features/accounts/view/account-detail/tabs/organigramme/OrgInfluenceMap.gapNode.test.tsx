import { orgGraphSchema } from '@bellum/contracts'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { i18n } from '@/i18n'
import { OrgInfluenceMap } from './OrgInfluenceMap'
import { buildOrgInfluenceMap } from './orgInfluenceMapData'

vi.mock('@/features/accounts/hooks/useEnrichAccount', () => ({
  useEnrichContacts: () => ({ mutate: vi.fn(), isPending: false }),
}))
vi.mock('@/features/accounts/hooks/useAccountMarketContext', () => ({
  useAccountMarketContext: () => ({ data: undefined, isPending: false, isError: false }),
}))
// #4072.1 — « Déjà connu » : ce test ne porte pas sur le lecteur des personnes connues de l'espace.
vi.mock('@/features/account-facts/useKnownPeople', () => ({
  useKnownPeople: () => null,
}))

/**
 * #4061.a — un nœud de RÔLE NON IDENTIFIÉ (un poste sans personne) s'ouvre sur une EXPLICATION — jamais sur
 * une fausse fiche : il n'y a pas de personne, donc pas de « Voir la fiche », et Bellum n'en invente pas.
 */
const REASON = 'Aucun contact achats identifié chez TF1 Pub'
const GRAPH = orgGraphSchema.parse({
  graphVersion: 1,
  entities: [
    { id: 'e-groupe', name: 'Groupe TF1', type: 'groupe', parentId: null, confidence: 92, status: 'operating' },
    { id: 'e-pub', name: 'TF1 Pub', type: 'filiale', parentId: 'e-groupe', confidence: 80, status: 'operating' },
  ],
  people: [],
  hierarchyEdges: [],
  influenceEdges: [],
  buyingCommittee: [],
  recommendedPath: [],
  rejectedItems: [],
  uncoveredZones: [
    {
      entityId: 'e-pub',
      family: 'Achats',
      hierarchyLevel: 'L5',
      importance: 'critique',
      reason: REASON,
      suggestedTitles: ['Responsable achats IT'],
      suggestedQueries: [],
    },
  ],
})

function renderMap(accountId?: string) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <OrgInfluenceMap map={buildOrgInfluenceMap(GRAPH)!} accountId={accountId} />
    </QueryClientProvider>,
  )
}

describe('#4061.a — un poste sans personne explique, il n’ouvre pas de fiche', () => {
  it('le nœud s’ouvre sur une explication qui cite la raison, sans « Voir la fiche »', async () => {
    const user = userEvent.setup()
    renderMap('a1')
    const node = screen.getByRole('button', { name: i18n.t('accountOrg:orgMap.gapExplain.toggle') })
    expect(node).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByText(i18n.t('accountOrg:orgMap.gapExplain.noRecord'))).toBeNull()

    await user.click(node)

    expect(node).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByText(i18n.t('accountOrg:orgMap.gapExplain.noRecord'))).toBeInTheDocument()
    expect(screen.getByText(i18n.t('accountOrg:orgMap.gapExplain.search'))).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: i18n.t('accountOrg:orgMap.viewProfile') })).toBeNull()
  })

  it('SAIT DIRE NON — sans compte porteur, l’explication ne promet AUCUNE recherche', async () => {
    const user = userEvent.setup()
    renderMap()
    await user.click(screen.getByRole('button', { name: i18n.t('accountOrg:orgMap.gapExplain.toggle') }))
    expect(screen.getByText(i18n.t('accountOrg:orgMap.gapExplain.noRecord'))).toBeInTheDocument()
    expect(screen.queryByText(i18n.t('accountOrg:orgMap.gapExplain.search'))).toBeNull()
  })
})
