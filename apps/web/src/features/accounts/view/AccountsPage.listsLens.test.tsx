import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { SessionContext } from '@/features/auth/session-context'

/**
 * #4088.8 — LES LISTES DE CIBLES ONT QUITTÉ `/mes-cibles` : elles vivent sur
 * Comptes, comme une lentille (`?lens=lists`, même motif que `effort`).
 *
 * La garde sait dire NON : sans la lentille, le bloc « listes » n'est PAS monté
 * (la liste des comptes reste), et le portefeuille offre un lien VISIBLE vers
 * les listes. Avec la lentille, le bloc remplace la liste et propose le retour.
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
    data: undefined,
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

describe('#4088.8 — /accounts : la lentille « Listes »', () => {
  // #4496 (PR 12C) — le lien « Mes listes de cibles » a quitté la page : le lot NAV le pose dans le sous-menu
  // Comptes. La lentille `?lens=lists` reste la porte (test suivant).
  it('par défaut : le portefeuille, sans lien vers les listes dans la page, pas de bloc listes', () => {
    renderAccountsPage()
    expect(screen.getByTestId('account-content')).toBeInTheDocument()
    expect(screen.queryByTestId('target-lists-section')).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Mes listes de cibles' })).not.toBeInTheDocument()
  })

  it('?lens=lists : le bloc listes remplace la liste, avec un retour aux comptes', () => {
    search.value = { lens: 'lists' }
    renderAccountsPage()
    expect(screen.getByTestId('target-lists-section')).toBeInTheDocument()
    expect(screen.queryByTestId('account-content')).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Retour aux comptes' })).toBeInTheDocument()
  })
})
