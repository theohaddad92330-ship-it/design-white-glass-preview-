import { render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { SessionContext } from '@/features/auth/session-context'

/**
 * #2474 — « supprimer ce bouton [Ajouter un compte], on ne passe que par
 * l'analyse » (Louis, 16/09/2026).
 *
 * ─────────────────────────────────────────────────────────────────────────
 * LE CHEMIN QUI REND CE RETRAIT SÛR
 * ─────────────────────────────────────────────────────────────────────────
 * `AddAccountButton` (#2150.33) ouvrait un ajout MANUEL au portefeuille, sans
 * lancer d'analyse. Ce n'est PAS la seule porte : `AccountsToolbar` (montée
 * par `AccountContent`, elle-même montée par cette page) porte déjà
 * `<ListLauncher typeKey="account" />`, qui ouvre `AccountLaunchSurface` — le
 * lancement d'une analyse EN PLACE depuis la liste, posé le 29/08/2026
 * précisément parce qu'une liste de comptes NON VIDE n'avait aucun moyen de
 * lancer une analyse. Ce test-ci ne mesure pas cette surface (elle a les
 * siens), il mesure seulement que le bouton manuel a disparu de l'entête.
 *
 * #2475 — « Mes vues enregistrées » (`AccountsSavedViews`) s'en va du même
 * geste : elle ne sert qu'à `/accounts`, aucun autre écran ne la monte.
 */

vi.mock('@/components/page/CustomerPage', () => ({
  CustomerPage: ({ children, headerActions }: { children: ReactNode; headerActions?: ReactNode }) => (
    <div>
      <div data-testid="header-actions">{headerActions}</div>
      {children}
    </div>
  ),
}))

vi.mock('@tanstack/react-router', () => ({
  useSearch: () => ({}),
  useNavigate: () => () => undefined,
  Link: ({ children, to }: { children: ReactNode; to?: string }) => <a href={to}>{children}</a>,
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

vi.mock('@/features/sprints/view/SprintBoard', () => ({
  SprintBoard: () => null,
}))

// #2475 — la surface partagée (governance/api) reste réelle, jamais
// re-mockée à vide : elle sert d'autres écrans (`open-needs`, `discover`).
// Défensif ici seulement contre l'appel réseau, pas contre son existence.
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

describe('#2474 — /accounts : le bouton manuel « Ajouter un compte » a quitté l’entête', () => {
  it('ne rend plus « Ajouter un compte » dans les actions d’entête', () => {
    renderAccountsPage()
    expect(screen.queryByRole('button', { name: /ajouter un compte/i })).not.toBeInTheDocument()
  })
})

describe('#2475 — /accounts : « Mes vues enregistrées » a quitté l’écran', () => {
  it('ne rend plus la section des vues enregistrées', () => {
    renderAccountsPage()
    expect(screen.queryByLabelText(/mes vues enregistrées/i)).not.toBeInTheDocument()
  })
})

describe('Refonte Théo — /accounts : « Importer » et « Analyser un compte » sont déclarés dans l’en-tête', () => {
  it('pose les deux gestes dans les actions d’en-tête, le second menant à la page d’analyse', () => {
    renderAccountsPage()
    const header = screen.getByTestId('header-actions')
    expect(within(header).getByRole('button', { name: /importer/i })).toBeInTheDocument()
    expect(within(header).getByRole('link', { name: 'Analyser un compte' })).toHaveAttribute('href', '/search')
  })
})
