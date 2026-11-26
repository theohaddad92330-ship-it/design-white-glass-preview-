import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { SessionContext } from '@/features/auth/session-context'

/**
 * Refonte Théo (contrôle du 23/10/2026) — `/accounts` dans L'ORDRE de la maquette a/comptes-liste :
 * en-tête (coque) → bande des quatre chiffres → « Reprendre le fil » → tête de liste (onglets du
 * portefeuille + lecture Commercial / Facturation) → barre d'outils et tableau (`AccountContent`).
 * Le test sait dire NON : il lit l'ordre RÉEL du DOM, pas la présence de chaque bloc.
 */

let search: Record<string, unknown> = {}
const contentProps: Record<string, unknown>[] = []

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
  useAccounts: () => ({
    data: {
      pages: [
        {
          counters: { total: 14, followed: 10, withoutNextAction: 3, activeRelations: 4, favorites: 3 },
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
  }),
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
      to_resume: true,
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

/** `a` précède `b` dans le document. */
function before(a: Element, b: Element): boolean {
  return Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING)
}

describe('/accounts — l’ordre de la maquette Théo a/comptes-liste', () => {
  it('chiffres → Reprendre le fil → tête de liste → tableau, dans cet ordre', () => {
    search = {}
    renderPage()
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Tes comptes')
    const figures = screen.getByTestId('accounts-key-figures')
    const shelf = screen.getByTestId('accounts-resume')
    // Le premier « Tout le portefeuille » du document est l'onglet de la tête de liste (les vues nommées suivent).
    const tabs = screen.getAllByText('Tout le portefeuille')[0]!
    const lens = screen.getByTestId('lens-toggle-row')
    const content = screen.getByTestId('account-content')
    expect(before(figures, shelf)).toBe(true)
    expect(before(shelf, tabs)).toBe(true)
    expect(before(tabs, lens)).toBe(true)
    expect(before(lens, content)).toBe(true)
    expect(screen.getByRole('heading', { name: 'Reprendre le fil' })).toBeVisible()
  })

  it('la lecture Commercial / Facturation vit dans la tête de liste, pas une seconde fois au-dessus du tableau', () => {
    search = {}
    contentProps.length = 0
    renderPage()
    expect(screen.getAllByTestId('lens-toggle-row')).toHaveLength(1)
    expect(contentProps.at(-1)?.lensToggleInHead).toBe(true)
  })

  it('la bascule Cartes se lit dans l’URL et change la forme du portefeuille', () => {
    contentProps.length = 0
    search = { layout: 'cards' }
    renderPage()
    expect(contentProps.at(-1)?.viewMode).toBe('grid')
    contentProps.length = 0
    search = {}
    renderPage()
    expect(contentProps.at(-1)?.viewMode).toBe('list')
  })

  it('le chiffre de la vue courante est allumé : « Relations actives » sous `headline=activeRelations`', () => {
    search = { headline: 'activeRelations' }
    renderPage()
    expect(screen.getByRole('button', { name: 'Relations actives : 4' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'Comptes dans l’espace : 14' })).toHaveAttribute('aria-pressed', 'false')
  })
})
