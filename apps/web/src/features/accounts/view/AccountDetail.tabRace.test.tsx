import { describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryHistory, createRootRoute, createRoute, createRouter, RouterProvider } from '@tanstack/react-router'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { Account } from '@bellum/contracts'
import { SessionContext, type SessionContextValue } from '@/features/auth/session-context'
import { accountDetailSearchSchema } from './account-detail/accountDetailSearch'
import { AccountDetail } from './AccountDetail'

/**
 * #2479 — LA SÉLECTION NE SUIT PAS LE CLIC (mesuré en production, SHA 63d34e295).
 *
 * ⚠️ Un test qui rend l'écran déjà sur le bon onglet serait vert aujourd'hui et
 * n'aurait jamais attrapé ce défaut : la mesure de production montre le
 * contenu qui suit le clic pendant que la pastille de la barre reste bloquée
 * sur l'ancien onglet. Ce test reproduit la TRANSITION, pas l'état final.
 *
 * La cause : `AccountDetail.tsx`, l'effet d'ARRIVÉE (« canonicaliser `?tab=`
 * au montage / au changement de compte ») dépendait de `resolvedInitialTab`,
 * qui redevient une valeur différente à chaque fois que l'URL change — y
 * compris en écho de la propre navigation du clic. Un aller-retour entre la
 * navigation de canonicalisation (posée à l'arrivée, avec l'ancien onglet) et
 * la navigation du clic (avec le nouvel onglet) peut se conclure dans le
 * mauvais ordre : si la navigation d'arrivée « gagne » APRÈS le clic, l'effet
 * se redéclenche et rappelle `setActiveTab(resolvedInitialTab)` avec
 * l'ANCIEN onglet — l'utilisateur revient là où il a cliqué depuis. Deux
 * écrivains pour un seul réglage (GA-26) : l'arrivée doit fixer l'onglet une
 * fois par compte, jamais à chaque relecture de l'URL.
 */

vi.mock('./account-detail/tabs/knowledge/AccountKnowledgeCounters', () => ({ AccountKnowledgeCounters: () => null }))
vi.mock('./account-detail/components/AccountDetailTabsBar', async importOriginal => {
  const actual = await importOriginal<typeof import('./account-detail/components/AccountDetailTabsBar')>()
  return {
    ...actual,
    AccountDetailTabsBar: ({ activeTab, onTabChange }: { activeTab: string; onTabChange: (tab: string) => void }) => (
      <button type="button" onClick={() => onTabChange('projects')}>
        pastille-active-{activeTab}
      </button>
    ),
  }
})
vi.mock('./account-detail/components/AccountDetailTabContent', () => ({
  AccountDetailTabContent: ({ activeTab }: { activeTab: string }) => <div data-testid="content">{activeTab}</div>,
}))
vi.mock('./account-detail/components/AccountDetailHero', () => ({ AccountDetailHero: () => null }))
vi.mock('./account-detail/components/AccountDetailStatusBanners', () => ({ AccountDetailStatusBanners: () => null }))
vi.mock('./account-detail/components/LinkedAccountsCard', () => ({ LinkedAccountsCard: () => null }))
vi.mock('./account-detail/components/GroupEntitiesCard', () => ({ GroupEntitiesCard: () => null }))
vi.mock('./account-detail/search/AccountDossierSearch', () => ({ AccountDossierSearch: () => null }))
vi.mock('@/features/accounts/hooks/useCoverageGaps', () => ({ useCoverageGaps: () => ({ data: undefined }) }))
vi.mock('@/features/accounts/hooks/useCancelAnalysis', () => ({
  useCancelAnalysis: () => ({ isPending: false, mutate: () => {} }),
}))
vi.mock('@/hooks/useAnalysisProgress', () => ({ useAnalysisProgress: () => ({ phase: null, percent: 0 }) }))

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0, staleTime: 0 } } })
const session: SessionContextValue = { user: null, loading: false }

const stubAccount: Account = {
  id: 'test-id',
  user_id: 'u1',
  company_name: 'ACME',
  siren: null,
  sector: null,
  employees: null,
  revenue: null,
  headquarters: null,
  website: null,
  subsidiaries: [],
  it_challenges: [],
  recent_signals: [],
  priority_score: null,
  priority_justification: null,
  raw_analysis: null,
  status: 'completed',
  error_message: null,
  user_context: null,
  api_cost_euros: null,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
}

function buildRouter(initialPath: string) {
  const rootRoute = createRootRoute()
  const detailRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/accounts/$id',
    validateSearch: accountDetailSearchSchema,
    component: () => {
      const search = detailRoute.useSearch()
      return <AccountDetail account={stubAccount} contacts={[]} initialTab={search.tab} />
    },
  })
  const router = createRouter({
    routeTree: rootRoute.addChildren([detailRoute]),
    history: createMemoryHistory({ initialEntries: [initialPath] }),
  })
  return router
}

describe('#2479 — la pastille ne doit pas revenir en arrière après le clic', () => {
  it('un écho tardif de la navigation d’arrivée ne doit pas écraser le clic de l’utilisateur', async () => {
    const user = userEvent.setup()
    const router = buildRouter('/accounts/test-id?tab=veille')
    render(
      <QueryClientProvider client={queryClient}>
        <SessionContext.Provider value={session}>
          <RouterProvider router={router} />
        </SessionContext.Provider>
      </QueryClientProvider>,
    )

    await waitFor(() => expect(screen.getByTestId('content')).toHaveTextContent('veille'))

    // Le clic sur « Opportunités » : contenu ET état interne passent à 'projects'.
    await user.click(screen.getByText(/^pastille-active-/))
    await waitFor(() => expect(screen.getByTestId('content')).toHaveTextContent('projects'))
    expect(screen.getByText('pastille-active-projects')).toBeTruthy()

    // Course simulée : la navigation de CANONICALISATION D'ARRIVÉE (posée par
    // l'effet de montage avec l'ANCIEN onglet 'veille') se conclut APRÈS le
    // clic — un `replace` tardif, exactement ce qu'un aller-retour réseau/
    // scheduler peut produire.
    await router.navigate({
      to: '/accounts/$id',
      params: { id: 'test-id' },
      search: prev => ({ ...prev, tab: 'veille' }),
      replace: true,
    })

    // Le clic de l'utilisateur doit survivre à cet écho tardif : ni le
    // contenu ni la pastille ne doivent revenir sur 'veille'. On laisse
    // volontairement le temps à l'effet de se rejouer (`waitFor` avec un
    // délai) : SANS le garde-fou, le retour à 'veille' n'apparaît qu'une
    // fois l'effet rejoué — un simple contrôle synchrone le manquerait.
    await new Promise(resolve => setTimeout(resolve, 50))
    expect(screen.getByTestId('content')).toHaveTextContent('projects')
    expect(screen.getByText('pastille-active-projects')).toBeTruthy()
  })
})

describe('#3674.4 — un résultat qui arrive pendant la lecture ne déplace pas l’utilisateur', () => {
  it('arrivée sur la stratégie ; le brief et le graphe arrivent ensuite : l’onglet en cours ne change pas', async () => {
    const live: { account: Account } = { account: stubAccount }
    const rootRoute = createRootRoute()
    const detailRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/accounts/$id',
      validateSearch: accountDetailSearchSchema,
      component: () => {
        const search = detailRoute.useSearch()
        return <AccountDetail account={live.account} contacts={[]} initialTab={search.tab} />
      },
    })
    const router = createRouter({
      routeTree: rootRoute.addChildren([detailRoute]),
      history: createMemoryHistory({ initialEntries: ['/accounts/test-id'] }),
    })
    render(
      <QueryClientProvider client={queryClient}>
        <SessionContext.Provider value={session}>
          <RouterProvider router={router} />
        </SessionContext.Provider>
      </QueryClientProvider>,
    )

    // Aucun onglet demandé : la stratégie (vue d'ensemble), compte sans brief ni graphe.
    await waitFor(() => expect(screen.getByTestId('content')).toHaveTextContent('overview'))

    // Le graphe arrive (autrefois : l'arrivée aurait basculé sur l'organigramme).
    live.account = {
      ...stubAccount,
      raw_analysis: { org: { orgGraph: { people: [{ id: 'p1', fullName: 'Jane Doe', identityStatus: 'seed' }] } } },
    }
    await router.navigate({
      to: '/accounts/$id',
      params: { id: 'test-id' },
      search: prev => ({ ...prev, find: 'x' }),
      replace: true,
    })
    await new Promise(resolve => setTimeout(resolve, 50))
    expect(screen.getByTestId('content')).toHaveTextContent('overview')
    expect(screen.getByText('pastille-active-overview')).toBeTruthy()
  })
})
