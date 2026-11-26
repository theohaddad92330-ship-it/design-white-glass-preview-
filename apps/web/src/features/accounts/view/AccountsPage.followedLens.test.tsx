import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { SessionContext } from '@/features/auth/session-context'

/**
 * #4583 — sous `?lens=followed`, la liste n'est PAS celle du portefeuille (`FollowedAccountsSection`, ses
 * propres comptes) : la bande de chiffres, comptée sur le portefeuille, disait 02 devant 3 lignes. Deux
 * lecteurs d'un même nombre qui ne lisent pas la même chose : la bande se TAIT sous cette lentille, et
 * reste là sur le portefeuille. La garde sait dire NON dans les deux sens.
 */

const search = { value: {} as Record<string, unknown> }

vi.mock('@/components/page/CustomerPage', () => ({
  CustomerPage: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}))

vi.mock('@tanstack/react-router', () => ({
  useSearch: () => search.value,
  useNavigate: () => () => undefined,
  Link: ({ children, to, search: linkSearch }: { children: ReactNode; to?: string; search?: unknown }) => (
    <a href={`${to}?${JSON.stringify(linkSearch ?? {})}`}>{children}</a>
  ),
}))

vi.mock('@/features/accounts/hooks/useAccounts', () => ({
  useAccounts: () => ({
    data: { pages: [{ data: [], pagination: { totalItems: 5 }, counters: { total: 5, favorites: 4 } }] },
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
    fetchNextPage: vi.fn(),
    hasNextPage: false,
    isFetchingNextPage: false,
  }),
}))
vi.mock('@/features/market-memory/api', () => ({
  useMarketMemoryPortfolio: () => ({ data: undefined, isError: false }),
}))
vi.mock('@/features/account-follows/view/FollowedAccountsSection', () => ({
  FollowedAccountsSection: ({ crmAccountIds }: { crmAccountIds?: ReadonlySet<string> }) => (
    <div data-testid="followed-section" data-crm={crmAccountIds ? 'filtered' : 'none'} />
  ),
}))
vi.mock('./AccountContent', () => ({
  AccountContent: () => <div data-testid="account-content" />,
}))
vi.mock('@/features/sprints/view/SprintBoard', () => ({ SprintBoard: () => null }))
vi.mock('@/features/target-lists/view/TargetListsSection', () => ({
  TargetListsSection: () => <div data-testid="target-lists-section" />,
}))
vi.mock('@/features/governance/api', () => ({
  useSavedViews: () => ({ data: [], isError: false }),
  useCreateSavedView: () => ({ mutate: vi.fn() }),
  useRemoveSavedView: () => ({ mutate: vi.fn(), isPending: false }),
}))
vi.mock('@/features/plan-features/usePlanFeature', () => ({
  usePlanFeature: () => ({ known: true, allowed: true }),
}))
vi.mock('@/features/profiles/hooks/useProfile', () => ({
  useProfile: () => ({ data: undefined }),
}))

const { AccountsPage } = await import('./AccountsPage')

function renderAccountsPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0, staleTime: 0 }, mutations: { retry: false } },
  })
  return render(
    <QueryClientProvider client={queryClient}>
      <SessionContext.Provider value={{ user: null, loading: false }}>
        <AccountsPage />
      </SessionContext.Provider>
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  search.value = {}
})

describe('#4583 — /accounts : la bande de chiffres et la lentille « Suivis »', () => {
  it('portefeuille : la bande est là', () => {
    renderAccountsPage()
    expect(screen.getByTestId('accounts-key-figures')).toBeInTheDocument()
  })

  it('?lens=followed : la liste est celle des suivis, la bande du portefeuille se tait', () => {
    search.value = { lens: 'followed', crm: 'only' }
    renderAccountsPage()
    expect(screen.getByTestId('followed-section')).toBeInTheDocument()
    expect(screen.queryByTestId('accounts-key-figures')).not.toBeInTheDocument()
  })

  // #4526.3 — Suivis ∩ Mon CRM : la puce CRM est transmise à la liste des suivis, sans elle tous les suivis restent.
  it('?lens=followed&crm=only : la liste des suivis reçoit le filtre CRM (intersection)', () => {
    search.value = { lens: 'followed', crm: 'only' }
    renderAccountsPage()
    expect(screen.getByTestId('followed-section')).toHaveAttribute('data-crm', 'filtered')
  })

  it('?lens=followed sans puce CRM : aucun filtre transmis', () => {
    search.value = { lens: 'followed' }
    renderAccountsPage()
    expect(screen.getByTestId('followed-section')).toHaveAttribute('data-crm', 'none')
  })
})
