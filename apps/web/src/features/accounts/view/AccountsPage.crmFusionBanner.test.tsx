import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { SessionContext } from '@/features/auth/session-context'

/**
 * #4603.5 — mesuré en prod le 31/10 : /accounts?q=veep → 0 actif, 3 « Veepee » archivés ; la bannière de fusion
 * n'apparaissait pas. CAUSE : elle n'était montée que si `counters.crm` (comptes CRM VIVANTS de l'espace, prédicat
 * de la puce « Mon CRM ») était non nul — un compteur qui ne mesure pas les PAIRES à proposer (le balayage a sa
 * propre définition « venu du CRM » : `origin = 'crm'` OU un lien de synchro, toutes origines). Compteur à 0,
 * illisible (`undefined`, jamais 0) ou pas encore lu ⇒ geste inatteignable. La bannière décide seule : droit
 * `integrations:manage`, puis la SIMULATION (`found`). Aucune paire ⇒ aucune ligne (dans la bannière).
 */

let search: Record<string, unknown> = {}
let counters: Record<string, number> | undefined = { total: 14 }
const contentProps: Record<string, unknown>[] = []
const accountsQueries: Record<string, unknown>[] = []

vi.mock('@/components/page/CustomerPage', () => ({
  CustomerPage: ({ children, pageTitle }: { children: ReactNode; pageTitle?: string }) => (
    <div>
      <h1>{pageTitle}</h1>
      {children}
    </div>
  ),
}))
vi.mock('@tanstack/react-router', () => ({
  useSearch: () => search,
  useNavigate: () => () => undefined,
  Link: ({ children, to }: { children: ReactNode; to?: string }) => <a href={to}>{children}</a>,
}))
vi.mock('@/features/accounts/hooks/useAccounts', () => ({
  useAccounts: (query: Record<string, unknown>) => (
    accountsQueries.push(query),
    {
      data: {
        pages: [
          {
            counters,
            pagination: { totalItems: 14 },
            data: [],
          },
        ],
      },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
      fetchNextPage: vi.fn(),
      hasNextPage: false,
      isFetchingNextPage: false,
    }
  ),
}))
vi.mock('@/features/accounts/hooks/useAccountsInfiniteScroll', () => ({
  useAccountsCache: () => [
    {
      id: 'sg',
      company_name: 'Société Générale',
      sector: 'Banque',
      priority_score: 9,
      status: 'completed',
      created_at: '2026-10-01',
      next_action_label: 'Relancer Maxime Delaunay',
      commercial_status: 'customer',
    },
  ],
  useInfiniteScrollRef: () => () => undefined,
}))
vi.mock('./AccountContent', () => ({
  AccountContent: (props: Record<string, unknown>) => {
    contentProps.push(props)
    return <div data-testid="account-content" />
  },
}))
vi.mock('@/features/sprints/view/SprintBoard', () => ({ SprintBoard: () => null }))
vi.mock('@/features/accounts/hooks/useSetAccountFavorite', () => ({
  useSetAccountFavorite: () => ({ mutate: vi.fn(), isPending: false }),
}))
vi.mock('@/components/primitives/AskLaura', () => ({ AskLaura: () => <span data-testid="ask-laura" /> }))
vi.mock('@/features/universal-import/view/ImportPortfolioButton', () => ({ ImportPortfolioButton: () => null }))

vi.mock('./accounts-list/AccountsCrmFusionBanner', () => ({
  AccountsCrmFusionBanner: () => <div data-testid="crm-fusion-banner-mounted" />,
}))

const { AccountsPage } = await import('./AccountsPage')

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <SessionContext.Provider value={{ user: null, loading: false }}>
        <AccountsPage />
      </SessionContext.Provider>
    </QueryClientProvider>,
  )
}

describe('/accounts — la bannière de fusion CRM ↔ analyse ne dépend plus du compteur « Mon CRM » (#4603.5)', () => {
  it.each([
    ['« Mon CRM » vaut 0 (les fiches CRM sont archivées, comme Veepee)', { total: 14, crm: 0 }],
    ['« Mon CRM » illisible (absent des compteurs)', { total: 14 }],
    ['compteurs pas encore lus', undefined],
  ])('%s : la bannière est montée, elle décide seule par la simulation', (_label, value) => {
    search = {}
    counters = value
    renderPage()
    expect(screen.getByTestId('crm-fusion-banner-mounted')).toBeInTheDocument()
  })
})
